import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = [
  "/",
  "/download/",
  "/updates/",
  "/brand/",
  "/docs/",
  "/docs/getting-started/",
  "/docs/architecture/",
  "/docs/ivr/",
  "/docs/softphone/",
  "/docs/voicemail/",
  "/docs/integrations/",
  "/docs/security/",
];
for (const width of [375, 768, 1024, 1440, 1920, 2560, 3840]) {
  for (const theme of ["light", "dark"] as const) {
    test(`${width}px ${theme}: all pages fit, render and load assets`, async ({
      page,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (response) => {
        if (response.url().startsWith(baseURL!) && response.status() >= 400)
          errors.push(`${response.status()} ${response.url()}`);
      });
      for (const route of routes) {
        const response = await page.goto(route);
        expect(response?.status(), route).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("h1")).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        for (const picture of await page.locator("img").all()) {
          await picture.scrollIntoViewIfNeeded();
          await expect
            .poll(() =>
              picture.evaluate(
                (element) =>
                  element instanceof HTMLImageElement &&
                  element.complete &&
                  element.naturalWidth > 0,
              ),
            )
            .toBe(true);
        }
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route} at ${width}`,
        ).toBe(true);
        const broken = await page
          .locator("img")
          .evaluateAll((images) =>
            images
              .filter(
                (image) =>
                  image instanceof HTMLImageElement &&
                  image.complete &&
                  image.naturalWidth === 0,
              )
              .map((image) => (image as HTMLImageElement).src),
          );
        expect(broken, route).toEqual([]);
        expect(
          await page.locator(".product-mockup").evaluateAll((elements) =>
            elements.every((element) => {
              const box = element.getBoundingClientRect();
              return box.left >= -1 && box.right <= innerWidth + 1;
            }),
          ),
          `Mockup bounds ${route} at ${width}`,
        ).toBe(true);
        expect(
          await page.locator(".container").evaluateAll((elements) =>
            elements.every((element) => {
              const r = element.getBoundingClientRect();
              return (
                r.left >= -1 && r.right <= innerWidth + 1 && r.width <= 1721
              );
            }),
          ),
          `Container bounds ${route}`,
        ).toBe(true);
        if (route === "/")
          await page.screenshot({
            path: info.outputPath(`home-${width}-${theme}.png`),
            fullPage: true,
          });
        if (route === "/docs/getting-started/" && [375, 1440].includes(width))
          await page.screenshot({
            path: info.outputPath(`guide-${width}-${theme}.png`),
            fullPage: true,
          });
      }
      expect(errors).toEqual([]);
    });
  }
}

test("appearance supports keyboard selection, persistence and system changes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /Choose color theme/ });
  await trigger.click();
  await expect(
    page.getByRole("radio", { name: "System", exact: true }),
  ).toBeFocused();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await trigger.click();
  await page.getByRole("radio", { name: "System", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("mouse effects toggle preserves normal animations and persists across pages", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await page.mouse.move(400, 300);
  await page.mouse.click(400, 300);
  await expect(page.locator(".pointer-ripple")).toHaveCount(1);
  await page.getByRole("button", { name: "Disable mouse effects" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await expect(page.locator("html")).toHaveAttribute(
    "data-pointer-effects",
    "off",
  );
  await expect(page.locator(".pointer-ripple")).toHaveCount(0);
  await expect(page.locator(".pointer-glow")).toBeHidden();
  for (const selector of [".ambient-pulses", ".map-signal"]) {
    const animation = page.locator(selector).first();
    await expect(animation).toHaveCSS("animation-play-state", "running");
    const start = await animation.evaluate((element) =>
      Number(element.getAnimations()[0].currentTime),
    );
    await expect
      .poll(() =>
        animation.evaluate((element) =>
          Number(element.getAnimations()[0].currentTime),
        ),
      )
      .toBeGreaterThan(start + 100);
  }
  await page.mouse.move(600, 400);
  await page.mouse.click(400, 300);
  await expect(page.locator(".pointer-ripple")).toHaveCount(0);
  await expect(page.locator(".ambient > svg > g")).not.toHaveAttribute(
    "transform",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-pointer-effects",
    "off",
  );
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await page.goto("/docs/");
  await expect(
    page.getByRole("button", { name: "Enable mouse effects" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Enable mouse effects" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-pointer-effects",
    "on",
  );
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await page.mouse.click(400, 300);
  await expect(page.locator(".pointer-ripple")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator("html")).toHaveAttribute(
    "data-pointer-effects",
    "off",
  );
  await expect(page.locator(".pointer-ripple")).toHaveCount(0);
});

test("saved mouse preference leaves normal motion enabled before hydration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("munasip-motion", "off"));
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-pointer-effects",
    "off",
  );
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await expect(page.locator(".ambient-pulses")).toHaveCSS(
    "animation-play-state",
    "running",
  );
  await expect(page.locator(".map-signal").first()).toHaveCSS(
    "animation-play-state",
    "running",
  );
});

test("ripples expire and remain bounded", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 10; i++) await page.mouse.click(410, 350);
  await expect
    .poll(() => page.locator(".pointer-ripple").count())
    .toBeLessThanOrEqual(5);
  await expect(page.locator(".pointer-ripple")).toHaveCount(0, {
    timeout: 3000,
  });
});

test("background work pauses on visibility and offscreen signals", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await expect(page.locator(".hero-visual")).toHaveAttribute(
    "data-offscreen",
    "true",
  );
  expect(
    await page
      .locator(".map-signal")
      .first()
      .evaluate((element) => getComputedStyle(element).animationPlayState),
  ).toBe("paused");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.locator("html")).toHaveAttribute(
    "data-pointer-effects",
    "off",
  );
  await page.mouse.click(400, 300);
  await expect(page.locator(".pointer-ripple")).toHaveCount(0);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await expect(page.locator("html")).toHaveAttribute(
    "data-pointer-effects",
    "on",
  );
});

test("preferences remain usable when persistent storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("storage unavailable");
    };
    Storage.prototype.setItem = () => {
      throw new Error("storage unavailable");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Choose color theme/ }).click();
  await page.getByRole("radio", { name: "Dark", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Disable mouse effects" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-pointer-effects",
    "off",
  );
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  expect(errors).toEqual([]);
});

test("core product content is available without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your calls.",
  );
  await page.getByRole("link", { name: "Get MunaSIP", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pull the prebuilt image." }),
  ).toBeVisible();
  await context.close();
});

test("mobile navigation, appearance, and FAQ remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const open = page.getByRole("button", { name: "Open navigation" });
  await open.click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await open.click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Documentation" })
    .click();
  await expect(page).toHaveURL(/\/docs\/$/);
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await page.goto("/");
  await page.getByRole("button", { name: /Choose color theme/ }).click();
  const bounds = await page.locator("#appearance-panel").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  await page.keyboard.press("Escape");
  await page.locator("summary").first().click();
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
});

test("screen tabs work with keyboard and route choices update the explanation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Live dashboard" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Visual IVR" })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    "A clear path for every caller.",
  );
  for (const name of [
    "Call logs",
    "Voicemail",
    "Queues",
    "Extensions",
    "Reports",
    "Settings & SSL",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("tabpanel").locator("svg[role='img']"),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "01 Sales" }).click();
  await expect(page.locator(".route-description")).toContainText(
    "extension 201",
  );
  await page.getByRole("button", { name: "03 After hours" }).click();
  await expect(page.locator(".route-description")).toContainText("voicemail");
});

test("SVG interface mockups animate independently of mouse effects and respect motion limits", async ({
  page,
}) => {
  const captures: string[] = [];
  page.on("request", (request) => {
    if (/\/images\/.*\.webp/.test(request.url())) captures.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.getByRole("button", { name: "Disable mouse effects" }).click();
  const panel = page.getByRole("tabpanel");
  await panel.scrollIntoViewIfNeeded();
  const animation = panel.locator(".mockup-motion").first();
  await expect(animation).toHaveCSS("animation-play-state", "running");
  const start = await animation.evaluate((element) =>
    Number(element.getAnimations()[0].currentTime),
  );
  await expect
    .poll(() =>
      animation.evaluate((element) =>
        Number(element.getAnimations()[0].currentTime),
      ),
    )
    .toBeGreaterThan(start + 100);
  await page.getByRole("tab", { name: "Visual IVR", exact: true }).click();
  const packet = panel.locator(".mockup-packet").first();
  const offset = await packet.evaluate(
    (element) => getComputedStyle(element).strokeDashoffset,
  );
  await expect
    .poll(() =>
      packet.evaluate((element) => getComputedStyle(element).strokeDashoffset),
    )
    .not.toBe(offset);
  await page.locator("#faq").scrollIntoViewIfNeeded();
  await expect(animation).toHaveCSS("animation-play-state", "paused");
  await expect(packet).toHaveCSS("animation-play-state", "paused");
  await panel.scrollIntoViewIfNeeded();
  await expect(animation).toHaveCSS("animation-play-state", "running");
  await expect(packet).toHaveCSS("animation-play-state", "running");
  const wave = page.locator(".softphone-image .mockup-wave").first();
  await wave.scrollIntoViewIfNeeded();
  const amplitude = await wave.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await expect
    .poll(() => wave.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(amplitude);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(animation).toHaveCSS("animation-name", "none");
  await expect(packet).toHaveCSS("animation-name", "none");
  await expect(wave).toHaveCSS("animation-name", "none");
  for (const path of ["/docs/ivr/", "/docs/softphone/"]) {
    await page.goto(path);
    const mockups = page.locator(".product-mockup svg[role='img']");
    await expect(mockups.first()).toBeVisible();
    expect(await mockups.count()).toBe(path.includes("ivr") ? 2 : 1);
  }
  expect(captures).toEqual([]);
});

test("copy buttons copy the exact install command and handle denied clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/download/");
  await page.getByRole("button", { name: "Copy install MunaSIP" }).click();
  await expect(page.getByRole("status")).toContainText("Copied to clipboard");
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("ghcr.io/munasip/munasip:1.7.5");
  expect(clipboard).toContain("-v munasip-data:/data");
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("denied")),
    });
  });
  await page.getByRole("button", { name: "Copy install MunaSIP" }).click();
  await expect(page.getByRole("status")).toContainText("Clipboard unavailable");
  expect(
    await page.evaluate(() => window.getSelection()?.toString()),
  ).toContain("docker run");
});

test("release notes connect the published image, source build and voicemail guide", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "See what changed", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "MunaSIP 1.7.5", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".release-detail")).toContainText(
    "voicemail inbox",
  );
  await expect(page.locator(".development-note")).toContainText(
    "MAIN BRANCH / AFTER v1.7.5",
  );
  await page
    .getByRole("link", { name: "Install MunaSIP 1.7.5", exact: true })
    .click();
  await expect(page.locator(".download-summary")).toContainText(
    "Current release: v1.7.5",
  );
  await page
    .getByText("Show the source install commands", { exact: true })
    .click();
  await expect(page.locator(".source-install-details")).toContainText(
    "git checkout v1.7.5",
  );
  await page.goto("/docs/voicemail/");
  await expect(
    page.getByRole("heading", {
      name: "Every message, in reach.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('svg[data-screen="voicemail"]')).toBeVisible();
  await page.goto("/docs/");
  await expect(
    page.getByRole("link", { name: /API reference Authentication/ }),
  ).toHaveAttribute(
    "href",
    "https://github.com/MunaSIP/MunaSIP/blob/v1.7.5/docs/API.md",
  );
});

test("static deep links refresh and the custom 404 returns 404", async ({
  page,
}) => {
  await page.goto("/docs/getting-started/#networking");
  const response = await page.reload();
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Get signalling and audio connected" }),
  ).toBeInViewport();
  const missing = await page.goto("/there-is-no-such-route/");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A missed connection",
  );
});

test("fragment destinations stay aligned when local fonts arrive late", async ({
  page,
}) => {
  let releaseFonts: () => void = () => {};
  const fontGate = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route("**/*.woff2", async (route) => {
    await fontGate;
    await route.continue();
  });
  try {
    await page.goto("/docs/getting-started/#networking", {
      waitUntil: "domcontentloaded",
    });
    releaseFonts();
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByRole("heading", { name: "Get signalling and audio connected" }),
    ).toBeInViewport();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Get signalling and audio connected" }),
    ).toBeInViewport();
  } finally {
    releaseFonts();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`accessible semantics and contrast in ${theme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const route of routes) {
      await page.goto(route);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, route).toEqual([]);
    }
    await page.goto("/");
    await page.getByRole("button", { name: /Choose color theme/ }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}
