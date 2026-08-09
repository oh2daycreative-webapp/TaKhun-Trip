var AuthService_DUMMY_SALT_ = "AAECAwQFBgcICQoLDA0ODw";
var AuthService_DUMMY_HASH_ = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
var AuthService_IDENTIFIER_FAILURE_LIMIT_ = 5;
var AuthService_IDENTIFIER_BUCKET_SECONDS_ = 900;
var AuthService_GLOBAL_FAILURE_LIMIT_ = 100;
var AuthService_GLOBAL_BUCKET_SECONDS_ = 600;
var AuthService_LOCK_TIMEOUT_MS_ = 10000;
var AuthService_BENCHMARK_PASSWORD_ = "takhun-admin-fixed-benchmark-password";
var AuthService_BENCHMARK_SALT_ = "AAECAwQFBgcICQoLDA0ODw";
var AuthService_BENCHMARK_HASH_ = "eGLDj63GbV5Z60GNKMQIGER5te8h0libLPyTBX3OokM";

function setupAdminAuthSchema() {
  var lock = null;
  var acquired = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock || !lock.tryLock(AuthService_LOCK_TIMEOUT_MS_)) throw new Error("AUTH_SETUP_LOCK");
    acquired = true;

    var properties = PropertiesService.getScriptProperties();
    AuthService_assertRandomKey_(properties.getProperty(ADMIN_AUTH_RANDOM_KEY_PROPERTY_));

    var config = getAppConfig_();
    if (!config.spreadsheetId) throw new Error("AUTH_SETUP_CONFIGURATION");
    var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
    var adminSheet = spreadsheet.getSheetByName(ADMIN_SHEET_NAME_);
    if (!adminSheet) throw new Error("AUTH_SETUP_ADMIN_SHEET");
    var sessionSheet = spreadsheet.getSheetByName(ADMIN_SESSION_SHEET_NAME_);

    var adminInspection = AuthService_inspectSetupSheet_(adminSheet, ADMIN_REQUIRED_HEADERS_);
    var sessionInspection = sessionSheet ?
      AuthService_inspectSetupSheet_(sessionSheet, ADMIN_SESSION_REQUIRED_HEADERS_) :
      { hasDataRows: false };
    var stateMode = AuthService_setupRandomState_(
      properties,
      !adminInspection.hasDataRows && !sessionInspection.hasDataRows
    );

    var adminHeaders = SheetService_ensureHeaders_(ADMIN_SHEET_NAME_, ADMIN_REQUIRED_HEADERS_);
    SheetService_assertUniqueHeaders_(adminHeaders.headers, ADMIN_REQUIRED_HEADERS_);
    if (!sessionSheet) {
      spreadsheet.insertSheet(ADMIN_SESSION_SHEET_NAME_);
    }
    var sessionHeaders = SheetService_ensureHeaders_(ADMIN_SESSION_SHEET_NAME_, ADMIN_SESSION_REQUIRED_HEADERS_);
    SheetService_assertUniqueHeaders_(sessionHeaders.headers, ADMIN_SESSION_REQUIRED_HEADERS_);

    return {
      random_key: "valid",
      random_state: stateMode,
      state_version: ADMIN_AUTH_STATE_VERSION_VALUE_,
      admins_headers: "valid",
      admin_sessions_headers: "valid"
    };
  } catch (_authSetupError) {
    throw new Error("AUTH_SETUP_FAILED");
  } finally {
    if (acquired) {
      try {
        lock.releaseLock();
      } catch (_authSetupReleaseError) {
        throw new Error("AUTH_SETUP_FAILED");
      }
    }
  }
}

function benchmarkAdminPbkdf2() {
  var saltBytes;
  var expectedBytes;
  try {
    saltBytes = CryptoService_base64UrlDecode_(AuthService_BENCHMARK_SALT_);
    expectedBytes = CryptoService_base64UrlDecode_(AuthService_BENCHMARK_HASH_);
    if (saltBytes.length !== ADMIN_PASSWORD_SALT_BYTES_ || expectedBytes.length !== ADMIN_PASSWORD_HASH_BYTES_) {
      throw new Error("AUTH_BENCHMARK_VECTOR");
    }

    CryptoService_pbkdf2Sha256_(
      AuthService_BENCHMARK_PASSWORD_,
      saltBytes,
      ADMIN_PBKDF2_ITERATIONS_
    );

    var durations = [];
    var correctness = [];
    for (var run = 0; run < 5; run += 1) {
      var startedAt = Date.now();
      var derived = CryptoService_pbkdf2Sha256_(
        AuthService_BENCHMARK_PASSWORD_,
        saltBytes,
        ADMIN_PBKDF2_ITERATIONS_
      );
      var finishedAt = Date.now();
      var duration = finishedAt - startedAt;
      if (!Number.isSafeInteger(duration) || duration < 0) throw new Error("AUTH_BENCHMARK_CLOCK");
      durations.push(duration);
      correctness.push(
        derived.length === ADMIN_PASSWORD_HASH_BYTES_ &&
        CryptoService_constantTimeEqual_(expectedBytes, derived)
      );
    }

    var sorted = durations.slice().sort(function (left, right) { return left - right; });
    var median = sorted[2];
    var maximum = Math.max.apply(Math, durations);
    var allCorrect = correctness.every(function (value) { return value === true; });
    return {
      iterations: ADMIN_PBKDF2_ITERATIONS_,
      durations_ms: durations,
      correctness: correctness,
      median_ms: median,
      max_ms: maximum,
      passed: allCorrect && median <= 3000 && maximum <= 5000
    };
  } catch (_authBenchmarkError) {
    throw new Error("AUTH_BENCHMARK_FAILED");
  }
}

function bootstrapFirstAdmin() {
  var properties;
  try {
    properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(ADMIN_BOOTSTRAP_ENABLED_PROPERTY_) !== "true") {
      throw new Error("AUTH_BOOTSTRAP_DISABLED");
    }
  } catch (_authBootstrapEnableError) {
    throw new Error("AUTH_BOOTSTRAP_FAILED");
  }

  var lock = null;
  var acquired = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock || !lock.tryLock(AuthService_LOCK_TIMEOUT_MS_)) throw new Error("AUTH_BOOTSTRAP_LOCK");
    acquired = true;

    AuthService_assertRandomKey_(properties.getProperty(ADMIN_AUTH_RANDOM_KEY_PROPERTY_));
    AuthService_assertEstablishedRandomState_(properties);

    var adminTable = SheetService_readTable_(ADMIN_SHEET_NAME_, ADMIN_REQUIRED_HEADERS_);
    SheetService_readTable_(ADMIN_SESSION_SHEET_NAME_, ADMIN_SESSION_REQUIRED_HEADERS_);
    var input = AuthService_bootstrapInput_(properties, adminTable);
    if (input.password === AuthService_unescapeHumanText_(input.displayName) ||
        input.password === AuthService_unescapeHumanText_(input.email)) {
      throw new Error("AUTH_BOOTSTRAP_PLAINTEXT");
    }

    var saltBytes = CryptoService_randomBytesLocked_("admin-password-salt", ADMIN_PASSWORD_SALT_BYTES_);
    var encodedSalt = CryptoService_base64UrlEncode_(saltBytes);
    if (!AuthService_validEncodedBytes_(encodedSalt, ADMIN_PASSWORD_SALT_BYTES_)) {
      throw new Error("AUTH_BOOTSTRAP_SALT");
    }
    var hashBytes = CryptoService_pbkdf2Sha256_(input.password, saltBytes, ADMIN_PBKDF2_ITERATIONS_);
    var encodedHash = CryptoService_base64UrlEncode_(hashBytes);
    if (!AuthService_validEncodedBytes_(encodedHash, ADMIN_PASSWORD_HASH_BYTES_)) {
      throw new Error("AUTH_BOOTSTRAP_HASH");
    }

    var adminId = "ADM-" + Utilities.getUuid();
    if (!AuthService_validIdentifier_(adminId, "ADM-")) throw new Error("AUTH_BOOTSTRAP_ID");
    var adminIdExists = adminTable.rows.some(function (entry) {
      return entry && entry.values && entry.values.admin_id === adminId;
    });
    if (adminIdExists) throw new Error("AUTH_BOOTSTRAP_ID_COLLISION");
    var timestamp = AuthService_timestamp_(Date.now());
    var record = {
      admin_id: SheetService_writeValue_("security", "admin_id", adminId),
      username: SheetService_writeValue_("security", "username", input.username),
      display_name: SheetService_writeValue_("human_text", "display_name", input.displayName),
      email: SheetService_writeValue_("human_text", "email", input.email),
      password_algorithm: SheetService_writeValue_("security", "password_algorithm", ADMIN_PASSWORD_ALGORITHM_),
      password_hash: SheetService_writeValue_("security", "password_hash", encodedHash),
      password_salt: SheetService_writeValue_("security", "password_salt", encodedSalt),
      password_iterations: SheetService_writeValue_("security", "password_iterations", ADMIN_PBKDF2_ITERATIONS_),
      role: SheetService_writeValue_("security", "role", "super_admin"),
      status: SheetService_writeValue_("security", "status", "active"),
      last_login_at: SheetService_writeValue_("security", "last_login_at", ""),
      created_at: SheetService_writeValue_("security", "created_at", timestamp),
      updated_at: SheetService_writeValue_("security", "updated_at", timestamp)
    };
    Object.keys(record).forEach(function (field) {
      var writtenValue = field === "display_name" || field === "email" ?
        AuthService_unescapeHumanText_(record[field]) : record[field];
      if (writtenValue === input.password) throw new Error("AUTH_BOOTSTRAP_PLAINTEXT");
    });

    appendSheetObject_(ADMIN_SHEET_NAME_, ADMIN_REQUIRED_HEADERS_, record);
    var verifiedTable = SheetService_readTable_(ADMIN_SHEET_NAME_, ADMIN_REQUIRED_HEADERS_);
    AuthService_verifyBootstrapRecord_(verifiedTable, record, input.password);
    AuthService_cleanupBootstrap_(properties);
    return { admin_id: adminId, username: input.username, cleanup: "complete" };
  } catch (authBootstrapError) {
    if (authBootstrapError && authBootstrapError.message === "AUTH_BOOTSTRAP_CLEANUP_FAILED") {
      throw new Error("AUTH_BOOTSTRAP_CLEANUP_FAILED");
    }
    throw new Error("AUTH_BOOTSTRAP_FAILED");
  } finally {
    if (acquired) {
      try {
        lock.releaseLock();
      } catch (_authBootstrapReleaseError) {
        throw new Error("AUTH_BOOTSTRAP_FAILED");
      }
    }
  }
}

function AuthService_inspectSetupSheet_(sheet, requiredHeaders) {
  var values = sheet.getDataRange().getValues();
  var lastRow = sheet.getLastRow();
  if (!Number.isSafeInteger(lastRow) || lastRow < 0) throw new Error("AUTH_SETUP_SHEET");
  if (lastRow === 0) return { hasDataRows: false };
  if (!values || !values.length) throw new Error("AUTH_SETUP_SHEET");
  var headers = values[0].map(function (header) {
    return typeof header === "string" ? header.trim() : header;
  });
  SheetService_assertUniqueHeaders_(headers, []);
  requiredHeaders.forEach(function (requiredHeader) {
    headers.forEach(function (header) {
      if (header !== requiredHeader && header.toLowerCase() === requiredHeader.toLowerCase()) {
        throw new Error("AUTH_SETUP_HEADERS");
      }
    });
  });
  var hasDataRows = values.slice(1).some(function (row) {
    return (row || []).some(function (cell) {
      return cell !== null && cell !== undefined && String(cell).trim() !== "";
    });
  });
  return { hasDataRows: hasDataRows };
}

function AuthService_assertRandomKey_(encodedKey) {
  if (typeof encodedKey !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(encodedKey)) {
    throw new Error("AUTH_RANDOM_KEY");
  }
  var keyBytes = CryptoService_base64UrlDecode_(encodedKey);
  if (keyBytes.length !== 32 || CryptoService_base64UrlEncode_(keyBytes) !== encodedKey) {
    throw new Error("AUTH_RANDOM_KEY");
  }
}

function AuthService_setupRandomState_(properties, authDataEmpty) {
  var counterText = properties.getProperty(ADMIN_AUTH_RANDOM_COUNTER_PROPERTY_);
  var versionText = properties.getProperty(ADMIN_AUTH_STATE_VERSION_PROPERTY_);
  var counterAbsent = counterText === null || counterText === undefined;
  var versionAbsent = versionText === null || versionText === undefined;
  if (counterAbsent && versionAbsent) {
    if (!authDataEmpty) throw new Error("AUTH_RANDOM_STATE");
    properties.setProperty(ADMIN_AUTH_RANDOM_COUNTER_PROPERTY_, String(0));
    properties.setProperty(ADMIN_AUTH_STATE_VERSION_PROPERTY_, String(ADMIN_AUTH_STATE_VERSION_VALUE_));
    return "initialized";
  }
  AuthService_assertRandomStateValues_(counterText, versionText);
  return "valid";
}

function AuthService_assertEstablishedRandomState_(properties) {
  AuthService_assertRandomStateValues_(
    properties.getProperty(ADMIN_AUTH_RANDOM_COUNTER_PROPERTY_),
    properties.getProperty(ADMIN_AUTH_STATE_VERSION_PROPERTY_)
  );
}

function AuthService_assertRandomStateValues_(counterText, versionText) {
  if (versionText !== String(ADMIN_AUTH_STATE_VERSION_VALUE_) ||
      typeof counterText !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(counterText)) {
    throw new Error("AUTH_RANDOM_STATE");
  }
  var counter = Number(counterText);
  if (!Number.isSafeInteger(counter) || counter < 0 || counter >= Number.MAX_SAFE_INTEGER) {
    throw new Error("AUTH_RANDOM_STATE");
  }
}

function AuthService_bootstrapInput_(properties, adminTable) {
  if (!adminTable || !Array.isArray(adminTable.rows)) throw new Error("AUTH_BOOTSTRAP_ADMINS");
  var requestedUsernameText = properties.getProperty(ADMIN_BOOTSTRAP_USERNAME_PROPERTY_);
  if (typeof requestedUsernameText !== "string" || requestedUsernameText.length > ADMIN_USERNAME_MAX_CHARACTERS_) {
    throw new Error("AUTH_BOOTSTRAP_INPUT");
  }
  var requestedUsername = requestedUsernameText.trim().toLowerCase();
  if (!new RegExp(ADMIN_USERNAME_PATTERN_).test(requestedUsername)) throw new Error("AUTH_BOOTSTRAP_INPUT");

  var usernames = Object.create(null);
  var activeExists = false;
  adminTable.rows.forEach(function (entry) {
    var account = entry && entry.values;
    if (!account || typeof account.username !== "string" || typeof account.status !== "string") {
      throw new Error("AUTH_BOOTSTRAP_ADMINS");
    }
    var canonical = account.username.trim().toLowerCase();
    if (account.username !== canonical || !new RegExp(ADMIN_USERNAME_PATTERN_).test(canonical) ||
        ADMIN_ALLOWED_STATUSES_.indexOf(account.status) === -1 ||
        Object.prototype.hasOwnProperty.call(usernames, canonical)) {
      throw new Error("AUTH_BOOTSTRAP_ADMINS");
    }
    usernames[canonical] = true;
    if (account.status === "active") activeExists = true;
  });
  if (activeExists || Object.prototype.hasOwnProperty.call(usernames, requestedUsername)) {
    throw new Error("AUTH_BOOTSTRAP_PRECONDITION");
  }

  var displayName = properties.getProperty(ADMIN_BOOTSTRAP_DISPLAY_NAME_PROPERTY_);
  if (typeof displayName !== "string" || !displayName.trim()) throw new Error("AUTH_BOOTSTRAP_INPUT");
  var displayLength = Array.from(displayName).length;
  CryptoService_utf8Bytes_(displayName);
  if (displayLength < ADMIN_DISPLAY_NAME_MIN_CODE_POINTS_ || displayLength > ADMIN_DISPLAY_NAME_MAX_CODE_POINTS_) {
    throw new Error("AUTH_BOOTSTRAP_INPUT");
  }

  var emailValue = properties.getProperty(ADMIN_BOOTSTRAP_EMAIL_PROPERTY_);
  var email = emailValue === null || emailValue === undefined ? "" : emailValue;
  if (typeof email !== "string" || email.length > ADMIN_EMAIL_MAX_CHARACTERS_) throw new Error("AUTH_BOOTSTRAP_INPUT");
  CryptoService_utf8Bytes_(email);

  var password = properties.getProperty(ADMIN_BOOTSTRAP_PASSWORD_PROPERTY_);
  if (typeof password !== "string" || password.length > ADMIN_PASSWORD_MAX_UTF8_BYTES_) {
    throw new Error("AUTH_BOOTSTRAP_INPUT");
  }
  var passwordLength = Array.from(password).length;
  var passwordBytes = CryptoService_utf8Bytes_(password);
  if (passwordLength < ADMIN_PASSWORD_PROVISIONING_MIN_CODE_POINTS_ ||
      passwordLength > ADMIN_PASSWORD_MAX_CODE_POINTS_ ||
      passwordBytes.length > ADMIN_PASSWORD_MAX_UTF8_BYTES_) {
    throw new Error("AUTH_BOOTSTRAP_INPUT");
  }
  return { username: requestedUsername, displayName: displayName, email: email, password: password };
}

function AuthService_verifyBootstrapRecord_(table, expectedRecord, plaintextPassword) {
  var matches = table.rows.filter(function (entry) {
    return entry && entry.values && entry.values.admin_id === expectedRecord.admin_id;
  });
  if (matches.length !== 1 || !AuthService_validAccount_(matches[0].values)) {
    throw new Error("AUTH_BOOTSTRAP_VERIFY");
  }
  ADMIN_REQUIRED_HEADERS_.forEach(function (field) {
    var verifiedValue = field === "display_name" || field === "email" ?
      AuthService_unescapeHumanText_(matches[0].values[field]) : matches[0].values[field];
    if (matches[0].values[field] !== expectedRecord[field] || verifiedValue === plaintextPassword) {
      throw new Error("AUTH_BOOTSTRAP_VERIFY");
    }
  });
}

function AuthService_cleanupBootstrap_(properties) {
  var failed = false;
  var temporaryProperties = [
    ADMIN_BOOTSTRAP_USERNAME_PROPERTY_,
    ADMIN_BOOTSTRAP_DISPLAY_NAME_PROPERTY_,
    ADMIN_BOOTSTRAP_EMAIL_PROPERTY_,
    ADMIN_BOOTSTRAP_PASSWORD_PROPERTY_
  ];
  temporaryProperties.forEach(function (propertyName) {
    try {
      properties.deleteProperty(propertyName);
    } catch (_authBootstrapDeleteError) {
      failed = true;
    }
  });
  try {
    properties.setProperty(ADMIN_BOOTSTRAP_ENABLED_PROPERTY_, "false");
  } catch (_authBootstrapDisableError) {
    failed = true;
  }
  temporaryProperties.forEach(function (propertyName) {
    try {
      if (properties.getProperty(propertyName) !== null) failed = true;
    } catch (_authBootstrapCleanupReadError) {
      failed = true;
    }
  });
  try {
    if (properties.getProperty(ADMIN_BOOTSTRAP_ENABLED_PROPERTY_) !== "false") failed = true;
  } catch (_authBootstrapDisableReadError) {
    failed = true;
  }
  if (failed) throw new Error("AUTH_BOOTSTRAP_CLEANUP_FAILED");
}

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
  if (typeof account.email !== "string") return false;
  var email = AuthService_unescapeHumanText_(account.email);
  if (email.length > ADMIN_EMAIL_MAX_CHARACTERS_) return false;
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
