# Takhun Trip Public Home Design

## Scope

Replace only the placeholder public home page with a mobile-first tourism landing page. Keep the existing static HTML, CSS, and JavaScript architecture, add no framework or CDN, do not change Apps Script, and do not commit until the user has reviewed the completed page.

## Visual Direction

Use the recommended “Emerald Journey” direction from the project design documentation: emerald lake, clear sky, deep forest, golden sunlight, and warm orange accents. The page should feel modern, colorful, premium, and distinctly travel-oriented. It must avoid government-website styling and generic AI-template patterns.

Until approved local photography is available, the hero and card media use local CSS gradients and lightweight decorative shapes. No external image request is allowed. Media containers retain stable aspect ratios and clear replacement points for real images.

## Page Architecture

The home page contains these regions in order:

1. Sticky site header with brand mark, desktop primary navigation, and mobile hamburger control.
2. Mobile drawer for secondary destinations.
3. Hero with readable overlay, Thai heading, concise subtitle, and two primary journeys.
4. Quick actions for places, routes, map, and trip planning.
5. Featured places rendered from editable JavaScript data.
6. Recommended routes rendered from editable JavaScript data.
7. Trip inspiration grouped by nature, community, food, cafe, and family styles.
8. Project footer with important links and editable placeholder contact details.
9. Mobile bottom navigation with Home, Places, Routes, and Trip Planner.

## Navigation Responsibilities

Desktop uses the top navigation for common public destinations. Mobile bottom navigation is visible only on mobile and holds the four most frequent destinations: Home, Places, Routes, and Trip Planner. Home has a visible active state and `aria-current="page"`.

The mobile drawer contains secondary destinations only: Map, Events, News, About, Contact, and a future language entry. It does not duplicate every bottom-navigation destination. The drawer uses a backdrop, exposes `aria-expanded` and `aria-controls`, closes from its close control, backdrop, or Escape key, and returns focus to the hamburger control after closing.

The mobile page reserves bottom padding for the fixed navigation and includes `env(safe-area-inset-bottom)`.

## Component and Data Boundaries

`public/index.html` owns semantic page regions, headings, navigation landmarks, mount points, and progressive fallback copy.

`public/js/app.js` owns editable sample arrays for featured places, recommended routes, and trip inspiration; card rendering; and drawer behavior. Rendering functions accept data and return markup without network access. Invalid or empty data produces a compact empty state rather than an exception.

`public/css/main.css` owns shared design tokens and safe global foundations. `public/css/components.css` owns home component presentation. `public/css/mobile.css` owns responsive changes, drawer presentation, mobile bottom navigation, and safe-area spacing. Home-specific selectors are scoped so existing placeholder pages remain usable.

## Content Direction

Thai is the default language. Hero copy invites visitors to discover Ban Ta Khun through lake, mountain, and community experiences. CTAs link according to the required link matrix: Trip Planner to `trip-planner.html`, all places to `places.html`, map to `map.html`, and routes to `routes.html`.

Sample featured content uses destinations named in project documentation, including Ratchaprapha Dam / Cheow Lan Lake, the heart-shaped mountain at Khao Theppitak, and Ban Chiao Lan community experiences. Sample routes expose stop count, approximate duration, and route type.

## Accessibility and Interaction

All controls have accessible names. Decorative SVGs are hidden from assistive technology; meaningful media has descriptive Thai labels or alt text. Touch targets are at least 44 by 44 CSS pixels. Keyboard focus uses a high-contrast `:focus-visible` treatment. Heading levels are sequential, landmarks are labeled, and active navigation is expressed with text/ARIA as well as color.

Motion is restrained and disabled under `prefers-reduced-motion`. The drawer prevents hidden controls from remaining interactive. Content remains usable from 360px upward with no horizontal overflow.

## Testing and Acceptance

Automated checks first assert required home regions, link targets, accessibility attributes, data-driven mount points, and mobile navigation structure. The checks must fail against the placeholder before implementation and pass after implementation.

Final verification includes:

- `./scripts/test.ps1`
- `./scripts/build.ps1`
- JavaScript syntax validation
- `git diff --check`
- Browser inspection at desktop width and 360px mobile width
- Drawer open/close, Escape behavior, focus restoration, active bottom navigation, safe-area spacing, console errors, and horizontal overflow

## Files

- Modify `public/index.html`
- Modify `public/css/main.css`
- Modify `public/css/components.css`
- Modify `public/css/mobile.css`
- Modify `public/js/app.js`
- Add a focused home-page verification script only if the existing test harness cannot express the acceptance criteria cleanly

No Apps Script file, admin page, or unrelated public page is changed.
