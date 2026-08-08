var AuthService_DUMMY_SALT_ = "AAECAwQFBgcICQoLDA0ODw";
var AuthService_DUMMY_HASH_ = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
var AuthService_IDENTIFIER_FAILURE_LIMIT_ = 5;
var AuthService_IDENTIFIER_BUCKET_SECONDS_ = 900;
var AuthService_GLOBAL_FAILURE_LIMIT_ = 100;
var AuthService_GLOBAL_BUCKET_SECONDS_ = 600;
var AuthService_LOCK_TIMEOUT_MS_ = 10000;

function adminLogin_(payload) {
  var input = AuthService_loginInput_(payload);
  var rateIdentifier = input.usernameValid ? input.username : "invalid-username";

  if (AuthService_isRateLimited_(rateIdentifier)) return AuthService_rateLimited_();
  if (!input.passwordValid) {
    AuthService_recordFailure_(rateIdentifier, false);
    return AuthService_credentialError_();
  }

  try {
    var initialAccount = AuthService_loginAccount_(input.username, input.usernameValid);
    var verification = AuthService_verifyPassword_(input.password, initialAccount);
    if (!verification.authenticated) {
      AuthService_recordFailure_(rateIdentifier, false);
      return AuthService_credentialError_();
    }

    var lock = LockService.getScriptLock();
    if (!lock || !lock.tryLock(AuthService_LOCK_TIMEOUT_MS_)) return AuthService_serverError_();
    try {
      var lockedAccount = AuthService_loginAccount_(input.username, true);
      if (!AuthService_sameVerifiedAccount_(initialAccount, lockedAccount)) {
        AuthService_recordFailure_(rateIdentifier, true);
        return AuthService_credentialError_();
      }

      var issuedAtMilliseconds = Date.now();
      var timestamp = AuthService_timestamp_(issuedAtMilliseconds);
      SheetService_updateObjectAtRow_(ADMIN_SHEET_NAME_, lockedAccount.sourceRowNumber, {
        last_login_at: SheetService_writeValue_("security", "last_login_at", timestamp),
        updated_at: SheetService_writeValue_("security", "updated_at", timestamp)
      });

      var tokenBytes = CryptoService_randomBytesLocked_("admin-session-token", ADMIN_SESSION_TOKEN_BYTES_);
      var rawToken = CryptoService_base64UrlEncode_(tokenBytes);
      if (!AuthService_validEncodedBytes_(rawToken, ADMIN_SESSION_TOKEN_BYTES_)) throw new Error("AUTH_TOKEN_GENERATION");
      var tokenHash = CryptoService_hashToken_(rawToken);
      var expiresAt = AuthService_timestamp_(issuedAtMilliseconds + ADMIN_SESSION_LIFETIME_MS_);
      var sessionId = "SES-" + Utilities.getUuid();
      var sessionTable = SheetService_readTable_(ADMIN_SESSION_SHEET_NAME_, ADMIN_SESSION_REQUIRED_HEADERS_);
      var sessionIdExists = sessionTable.rows.some(function (entry) {
        return entry && entry.values && entry.values.session_id === sessionId;
      });
      if (sessionIdExists) throw new Error("AUTH_SESSION_ID_COLLISION");
      var sessionRecord = {
        session_id: SheetService_writeValue_("security", "session_id", sessionId),
        admin_id: SheetService_writeValue_("security", "admin_id", lockedAccount.values.admin_id),
        token_hash: SheetService_writeValue_("security", "token_hash", tokenHash),
        created_at: SheetService_writeValue_("security", "created_at", timestamp),
        expires_at: SheetService_writeValue_("security", "expires_at", expiresAt),
        revoked_at: SheetService_writeValue_("security", "revoked_at", ""),
        last_seen_at: SheetService_writeValue_("security", "last_seen_at", timestamp)
      };
      appendSheetObject_(ADMIN_SESSION_SHEET_NAME_, ADMIN_SESSION_REQUIRED_HEADERS_, sessionRecord);
      AuthService_clearIdentifierRate_(rateIdentifier);
      return AuthService_success_({
        admin: AuthService_safeAdmin_(lockedAccount.values),
        token: rawToken,
        expires_at: expiresAt
      });
    } finally {
      lock.releaseLock();
    }
  } catch (_authLoginError) {
    return AuthService_serverError_();
  }
}

function adminValidateSession_(token) {
  if (!AuthService_validRawToken_(token)) return AuthService_sessionError_();
  try {
    var context = AuthService_validateSessionContext_(token);
    if (!context) return AuthService_sessionError_();
    return AuthService_success_({ admin: context.admin, expires_at: context.expires_at });
  } catch (_authValidationError) {
    return AuthService_serverError_();
  }
}

function adminLogout_(token) {
  if (!AuthService_validRawToken_(token)) return AuthService_validationError_();
  try {
    var tokenHash = CryptoService_hashToken_(token);
    var initialMatches = AuthService_matchingSessions_(
      SheetService_readTable_(ADMIN_SESSION_SHEET_NAME_, ADMIN_SESSION_REQUIRED_HEADERS_),
      tokenHash
    );
    if (initialMatches.length === 0) return AuthService_success_({});
    if (initialMatches.length !== 1 || !AuthService_validSessionRow_(initialMatches[0].values)) {
      return AuthService_serverError_();
    }
    if (initialMatches[0].values.revoked_at !== "" || Date.now() >= Date.parse(initialMatches[0].values.expires_at)) {
      return AuthService_success_({});
    }

    var lock = LockService.getScriptLock();
    if (!lock || !lock.tryLock(AuthService_LOCK_TIMEOUT_MS_)) return AuthService_serverError_();
    try {
      var lockedMatches = AuthService_matchingSessions_(
        SheetService_readTable_(ADMIN_SESSION_SHEET_NAME_, ADMIN_SESSION_REQUIRED_HEADERS_),
        tokenHash
      );
      if (lockedMatches.length === 0) return AuthService_success_({});
      if (lockedMatches.length !== 1 || !AuthService_validSessionRow_(lockedMatches[0].values)) {
        return AuthService_serverError_();
      }
      if (lockedMatches[0].values.revoked_at !== "" || Date.now() >= Date.parse(lockedMatches[0].values.expires_at)) {
        return AuthService_success_({});
      }
      SheetService_updateObjectAtRow_(ADMIN_SESSION_SHEET_NAME_, lockedMatches[0].sourceRowNumber, {
        revoked_at: SheetService_writeValue_("security", "revoked_at", AuthService_timestamp_(Date.now()))
      });
      return AuthService_success_({});
    } finally {
      lock.releaseLock();
    }
  } catch (_authLogoutError) {
    return AuthService_serverError_();
  }
}

function AuthService_requireAdmin_(token) {
  if (!AuthService_validRawToken_(token)) throw new Error("UNAUTHORIZED");
  var context = AuthService_validateSessionContext_(token);
  if (!context) throw new Error("UNAUTHORIZED");
  return context.admin;
}

function AuthService_loginInput_(payload) {
  var source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  var usernameValid = typeof source.username === "string" &&
    source.username.length <= ADMIN_USERNAME_MAX_CHARACTERS_;
  var username = usernameValid ? source.username.trim().toLowerCase() : "";
  usernameValid = usernameValid && new RegExp(ADMIN_USERNAME_PATTERN_).test(username);

  var passwordValid = typeof source.password === "string" &&
    source.password.length > 0 &&
    source.password.length <= ADMIN_PASSWORD_MAX_UTF8_BYTES_;
  if (passwordValid) {
    try {
      var passwordBytes = CryptoService_utf8Bytes_(source.password);
      passwordValid = Array.from(source.password).length <= ADMIN_PASSWORD_MAX_CODE_POINTS_ &&
        passwordBytes.length <= ADMIN_PASSWORD_MAX_UTF8_BYTES_;
    } catch (_authPasswordEncodingError) {
      passwordValid = false;
    }
  }
  return {
    username: username,
    usernameValid: usernameValid,
    password: passwordValid ? source.password : "",
    passwordValid: passwordValid
  };
}

function AuthService_loginAccount_(canonicalUsername, usernameValid) {
  var table = SheetService_readTable_(ADMIN_SHEET_NAME_, ADMIN_REQUIRED_HEADERS_);
  if (!usernameValid) return null;
  var matches = table.rows.filter(function (entry) {
    var stored = entry && entry.values ? entry.values.username : null;
    return typeof stored === "string" && stored.trim().toLowerCase() === canonicalUsername;
  });
  if (matches.length !== 1) return null;
  var account = matches[0];
  if (!AuthService_validAccount_(account.values) || account.values.status !== "active") return null;
  return account;
}

function AuthService_verifyPassword_(password, account) {
  var saltText = account ? account.values.password_salt : AuthService_DUMMY_SALT_;
  var hashText = account ? account.values.password_hash : AuthService_DUMMY_HASH_;
  var iterations = account ? account.values.password_iterations : ADMIN_PBKDF2_ITERATIONS_;
  var saltBytes = CryptoService_base64UrlDecode_(saltText);
  var expectedBytes = CryptoService_base64UrlDecode_(hashText);
  var computedBytes = CryptoService_pbkdf2Sha256_(password, saltBytes, iterations);
  var matches = CryptoService_constantTimeEqual_(expectedBytes, computedBytes);
  return { authenticated: !!account && matches };
}

function AuthService_sameVerifiedAccount_(initialAccount, lockedAccount) {
  if (!initialAccount || !lockedAccount) return false;
  var initial = initialAccount.values;
  var locked = lockedAccount.values;
  return initial.admin_id === locked.admin_id &&
    initial.username === locked.username &&
    initial.password_algorithm === locked.password_algorithm &&
    initial.password_hash === locked.password_hash &&
    initial.password_salt === locked.password_salt &&
    initial.password_iterations === locked.password_iterations &&
    locked.status === "active";
}

function AuthService_validAccount_(account) {
  if (!account || typeof account !== "object" || Array.isArray(account)) return false;
  if (!AuthService_validIdentifier_(account.admin_id, "ADM-")) return false;
  if (typeof account.username !== "string" || !new RegExp(ADMIN_USERNAME_PATTERN_).test(account.username)) return false;
  if (typeof account.display_name !== "string") return false;
  var displayName = AuthService_unescapeHumanText_(account.display_name);
  var displayLength = Array.from(displayName).length;
  if (displayLength < ADMIN_DISPLAY_NAME_MIN_CODE_POINTS_ || displayLength > ADMIN_DISPLAY_NAME_MAX_CODE_POINTS_) return false;
  if (typeof account.email !== "string" || account.email.length > ADMIN_EMAIL_MAX_CHARACTERS_) return false;
  if (account.password_algorithm !== ADMIN_PASSWORD_ALGORITHM_) return false;
  if (!AuthService_validEncodedBytes_(account.password_hash, ADMIN_PASSWORD_HASH_BYTES_)) return false;
  if (!AuthService_validEncodedBytes_(account.password_salt, ADMIN_PASSWORD_SALT_BYTES_)) return false;
  if (!Number.isSafeInteger(account.password_iterations) ||
      account.password_iterations < ADMIN_STORED_ITERATIONS_MIN_ ||
      account.password_iterations > ADMIN_STORED_ITERATIONS_MAX_) return false;
  if (ADMIN_ALLOWED_ROLES_.indexOf(account.role) === -1 || ADMIN_ALLOWED_STATUSES_.indexOf(account.status) === -1) return false;
  if (account.last_login_at !== "" && !AuthService_isTimestamp_(account.last_login_at)) return false;
  if (!AuthService_isTimestamp_(account.created_at) || !AuthService_isTimestamp_(account.updated_at)) return false;
  return true;
}

function AuthService_validateSessionContext_(rawToken) {
  var tokenHash = CryptoService_hashToken_(rawToken);
  var matches = AuthService_matchingSessions_(
    SheetService_readTable_(ADMIN_SESSION_SHEET_NAME_, ADMIN_SESSION_REQUIRED_HEADERS_),
    tokenHash
  );
  if (matches.length !== 1) return null;
  var session = matches[0].values;
  if (!AuthService_validSessionRow_(session) || session.revoked_at !== "" || Date.now() >= Date.parse(session.expires_at)) {
    return null;
  }

  var adminTable = SheetService_readTable_(ADMIN_SHEET_NAME_, ADMIN_REQUIRED_HEADERS_);
  var admins = adminTable.rows.filter(function (entry) {
    return entry && entry.values && entry.values.admin_id === session.admin_id;
  });
  if (admins.length !== 1 || !AuthService_validAccount_(admins[0].values) || admins[0].values.status !== "active") {
    return null;
  }
  return { admin: AuthService_safeAdmin_(admins[0].values), expires_at: session.expires_at };
}

function AuthService_matchingSessions_(table, tokenHash) {
  var expectedBytes = CryptoService_base64UrlDecode_(tokenHash);
  return table.rows.filter(function (entry) {
    if (!entry || !entry.values || !AuthService_validEncodedBytes_(entry.values.token_hash, ADMIN_SESSION_TOKEN_BYTES_)) {
      return false;
    }
    var storedBytes = CryptoService_base64UrlDecode_(entry.values.token_hash);
    return CryptoService_constantTimeEqual_(expectedBytes, storedBytes);
  });
}

function AuthService_validSessionRow_(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) return false;
  if (!AuthService_validIdentifier_(session.session_id, "SES-") || !AuthService_validIdentifier_(session.admin_id, "ADM-")) {
    return false;
  }
  if (!AuthService_validEncodedBytes_(session.token_hash, ADMIN_SESSION_TOKEN_BYTES_)) return false;
  if (!AuthService_isTimestamp_(session.created_at) || !AuthService_isTimestamp_(session.expires_at)) return false;
  if (session.revoked_at !== "" && !AuthService_isTimestamp_(session.revoked_at)) return false;
  if (!AuthService_isTimestamp_(session.last_seen_at)) return false;
  var created = Date.parse(session.created_at);
  var expires = Date.parse(session.expires_at);
  return expires === created + ADMIN_SESSION_LIFETIME_MS_ && session.last_seen_at === session.created_at;
}

function AuthService_safeAdmin_(account) {
  return {
    admin_id: account.admin_id,
    username: account.username,
    display_name: AuthService_unescapeHumanText_(account.display_name),
    role: account.role
  };
}

function AuthService_rateKeys_(canonicalUsername) {
  var digest = CryptoService_base64UrlEncode_(
    CryptoService_sha256_(CryptoService_utf8Bytes_(canonicalUsername))
  );
  return {
    identifier: "admin-auth:identifier:" + digest + ":" + Math.floor(Date.now() / (AuthService_IDENTIFIER_BUCKET_SECONDS_ * 1000)),
    global: "admin-auth:global:" + Math.floor(Date.now() / (AuthService_GLOBAL_BUCKET_SECONDS_ * 1000))
  };
}

function AuthService_isRateLimited_(canonicalUsername) {
  try {
    var cache = CacheService.getScriptCache();
    var keys = AuthService_rateKeys_(canonicalUsername);
    return AuthService_rateCount_(cache.get(keys.identifier)) >= AuthService_IDENTIFIER_FAILURE_LIMIT_ ||
      AuthService_rateCount_(cache.get(keys.global)) >= AuthService_GLOBAL_FAILURE_LIMIT_;
  } catch (_authRateReadError) {
    return false;
  }
}

function AuthService_recordFailure_(canonicalUsername, lockAlreadyHeld) {
  var lock = null;
  var acquired = false;
  try {
    var cache = CacheService.getScriptCache();
    if (!lockAlreadyHeld) {
      lock = LockService.getScriptLock();
      if (!lock || !lock.tryLock(AuthService_LOCK_TIMEOUT_MS_)) return;
      acquired = true;
    }
    var keys = AuthService_rateKeys_(canonicalUsername);
    cache.put(
      keys.identifier,
      String(AuthService_rateCount_(cache.get(keys.identifier)) + 1),
      AuthService_IDENTIFIER_BUCKET_SECONDS_
    );
    cache.put(
      keys.global,
      String(AuthService_rateCount_(cache.get(keys.global)) + 1),
      AuthService_GLOBAL_BUCKET_SECONDS_
    );
  } catch (_authRateWriteError) {
    // Throttling is best-effort and never establishes authentication.
  } finally {
    if (acquired) lock.releaseLock();
  }
}

function AuthService_clearIdentifierRate_(canonicalUsername) {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove(AuthService_rateKeys_(canonicalUsername).identifier);
  } catch (_authRateRemoveError) {
    // The committed session remains authoritative if optional rate state is unavailable.
  }
}

function AuthService_rateCount_(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) return 0;
  var count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function AuthService_validRawToken_(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) &&
    AuthService_validEncodedBytes_(token, ADMIN_SESSION_TOKEN_BYTES_);
}

function AuthService_validEncodedBytes_(value, expectedLength) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    var bytes = CryptoService_base64UrlDecode_(value);
    return bytes.length === expectedLength && CryptoService_base64UrlEncode_(bytes) === value;
  } catch (_authEncodingError) {
    return false;
  }
}

function AuthService_validIdentifier_(value, prefix) {
  return typeof value === "string" && value.slice(0, 4) === prefix &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.slice(4));
}

function AuthService_isTimestamp_(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  var parsed = new Date(value);
  return !isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function AuthService_timestamp_(milliseconds) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error("AUTH_TIMESTAMP");
  var value = new Date(milliseconds).toISOString();
  if (!AuthService_isTimestamp_(value)) throw new Error("AUTH_TIMESTAMP");
  return value;
}

function AuthService_unescapeHumanText_(value) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function AuthService_success_(data) {
  return { ok: true, data: data, message: "success" };
}

function AuthService_credentialError_() {
  return { ok: false, error: { code: "UNAUTHORIZED", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" } };
}

function AuthService_sessionError_() {
  return { ok: false, error: { code: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบ" } };
}

function AuthService_rateLimited_() {
  return { ok: false, error: { code: "RATE_LIMITED", message: "มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง" } };
}

function AuthService_validationError_() {
  return { ok: false, error: { code: "VALIDATION_ERROR", message: "ข้อมูล session ไม่ถูกต้อง" } };
}

function AuthService_serverError_() {
  return { ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" } };
}
