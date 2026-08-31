import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  linkedInExternalApplyHeaderHtml,
  linkedInApplicationSentModalHtml,
  linkedInPreReviewModalHtml,
  linkedInReviewModalHtml,
  linkedInSafetyReminderModalHtml,
  linkedInSafetyReminderNoDialogHtml,
} from "../fixtures/linkedin.js";
import { PlaywrightLinkedInEasyApplyDriver } from "../../src/linkedin/playwrightEasyApplyDriver.js";

describe("PlaywrightLinkedInEasyApplyDriver", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("replaces a timed-out page inside the same browser context", async () => {
    const context = await browser.newContext();
    try {
      const timedOutPage = await context.newPage();
      const unrelatedBlankPage = await context.newPage();
      const unrelatedPage = await context.newPage();
      await unrelatedPage.goto("data:text/html,<title>Unrelated page</title>");
      const driver = new PlaywrightLinkedInEasyApplyDriver(timedOutPage, {
        pageResetTimeoutMs: 5_000,
      });
      let drainObservedClosedPage = false;
      let releaseTimedOutOperation!: () => void;
      const timedOutOperationDrained = new Promise<void>((resolve) => {
        releaseTimedOutOperation = resolve;
      });

      const resetPromise = driver.resetAfterProcessingTimeout({
        waitForTimedOutOperations: async () => {
          drainObservedClosedPage = timedOutPage.isClosed();
          await timedOutOperationDrained;
        },
      });

      await expect.poll(() => timedOutPage.isClosed()).toBe(true);
      expect(drainObservedClosedPage).toBe(true);
      expect(context.pages()).toEqual([unrelatedBlankPage, unrelatedPage]);
      releaseTimedOutOperation();
      await resetPromise;

      expect(timedOutPage.isClosed()).toBe(true);
      // The driver only retires pages it owns. Other pages in the shared
      // context, including an unrelated blank page, remain untouched.
      expect(unrelatedBlankPage.isClosed()).toBe(false);
      expect(unrelatedPage.isClosed()).toBe(false);
      expect(context.browser()).toBe(browser);

      const replacementPage = context.pages().find((page) =>
        page !== unrelatedBlankPage &&
        page !== unrelatedPage &&
        page !== timedOutPage
      );
      expect(replacementPage).toBeDefined();
      await replacementPage!.setContent(linkedInPreReviewModalHtml);
      await expect(driver.collectStepState()).resolves.toMatchObject({
        modalTitle: "Apply to Crossing Hurdles",
        primaryAction: "review",
      });
    } finally {
      await context.close();
    }
  });

  it("bounds page reset when the timed-out driver operation does not drain", async () => {
    const context = await browser.newContext();
    try {
      const timedOutPage = await context.newPage();
      const driver = new PlaywrightLinkedInEasyApplyDriver(timedOutPage, {
        pageResetTimeoutMs: 25,
      });

      await expect(driver.resetAfterProcessingTimeout({
        waitForTimedOutOperations: () => new Promise<void>(() => undefined),
      })).rejects.toThrow("did not finish within 25ms");

      expect(timedOutPage.isClosed()).toBe(true);
      expect(context.pages()).toEqual([]);
      const probePage = await context.newPage();
      expect(probePage.isClosed()).toBe(false);
    } finally {
      await context.close();
    }
  });

  it("does not adopt a replacement after the outer reset deadline aborts", async () => {
    const context = await browser.newContext();
    try {
      const timedOutPage = await context.newPage();
      const driver = new PlaywrightLinkedInEasyApplyDriver(timedOutPage, {
        pageResetTimeoutMs: 5_000,
      });
      const abortController = new AbortController();
      let releaseTimedOutOperation!: () => void;
      const timedOutOperation = new Promise<void>((resolve) => {
        releaseTimedOutOperation = resolve;
      });

      const resetPromise = driver.resetAfterProcessingTimeout({
        waitForTimedOutOperations: () => timedOutOperation,
        signal: abortController.signal,
      });
      await expect.poll(() => timedOutPage.isClosed()).toBe(true);
      abortController.abort(new Error("outer reset deadline expired"));
      releaseTimedOutOperation();

      await expect(resetPromise).rejects.toThrow("outer reset deadline expired");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(context.pages()).toEqual([]);
      const probePage = await context.newPage();
      expect(probePage.isClosed()).toBe(false);
    } finally {
      await context.close();
    }
  });

  it("creates a disposable processing page without taking ownership of the collection page", async () => {
    const context = await browser.newContext();
    try {
      await context.route("https://www.linkedin.com/**", async (route) => {
        await route.fulfill({
          contentType: "text/html",
          body: "<main class='jobs-details'><button aria-label='Easy Apply to Backend Developer'>Easy Apply</button></main>",
        });
      });
      const collectionPage = await context.newPage();
      const unrelatedPage = await context.newPage();
      const collectionDriver = new PlaywrightLinkedInEasyApplyDriver(collectionPage);

      const lease = await collectionDriver.createProcessingDriver(
        "https://www.linkedin.com/jobs/view/4457000000",
      );

      expect(context.pages()).toHaveLength(3);
      const processingPage = context.pages().find(
        (page) => page !== collectionPage && page !== unrelatedPage,
      );
      expect(processingPage?.url()).toBe("about:blank");
      await lease.driver.open("https://www.linkedin.com/jobs/view/4457000000");
      await expect(lease.driver.isEasyApplyAvailable()).resolves.toBe(true);
      await lease.dispose();
      expect(context.pages()).toEqual([collectionPage, unrelatedPage]);
      expect(collectionPage.isClosed()).toBe(false);
      expect(unrelatedPage.isClosed()).toBe(false);
    } finally {
      await context.close();
    }
  });

  it("detects the pre-review modal state from real LinkedIn-like HTML", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInPreReviewModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to Crossing Hurdles",
      headingText: "Education",
      primaryAction: "review",
      buttonLabels: ["Back", "Review"],
    });

    await page.close();
  });

  it("detects the review modal state and submit button from real LinkedIn-like HTML", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInReviewModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to Crossing Hurdles",
      headingText: "Review your application",
      primaryAction: "submit",
      buttonLabels: ["Back", "Submit application"],
    });

    await page.close();
  });

  it("collects review diagnostics from real LinkedIn-like review HTML", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInReviewModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const result = await driver.collectReviewDiagnostics();

    expect(result.validationMessages).toEqual([]);
    expect(result.blockingFields).toEqual([]);
    expect(result.buttonStates).toEqual([
      {
        action: "next",
        visible: false,
        disabled: false,
        label: null,
      },
      {
        action: "review",
        visible: false,
        disabled: false,
        label: null,
      },
      {
        action: "submit",
        visible: true,
        disabled: false,
        label: "Submit application",
      },
    ]);

    await page.close();
  });

  it("returns an empty unknown state when the Easy Apply modal is missing or closed", async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(100);
    await page.setContent(`
      <main>
        <input aria-label="Search" placeholder="Search" role="combobox" />
        <button type="button">Message</button>
      </main>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.collectQuestions()).resolves.toEqual([]);
    await expect(driver.collectStepState()).resolves.toEqual({
      modalTitle: null,
      headingText: null,
      primaryAction: "unknown",
      buttonLabels: [],
    });
    await expect(driver.getPrimaryAction()).resolves.toBe("unknown");

    await page.close();
  });

  it("ignores a focused generic Search typeahead instead of treating it as an Easy Apply question", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div role="dialog" aria-label="Search people">
        <input id="global-search" aria-label="Search" placeholder="Search" role="combobox" />
        <div role="listbox">Pentanom</div>
        <button type="button">Dismiss</button>
      </div>
    `);
    await page.locator("#global-search").focus();

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const questions = await driver.collectQuestions();
    const diagnostics = await driver.collectUnknownActionDiagnostics();

    expect(questions).toEqual([]);
    expect(diagnostics.activeElement).toMatchObject({
      tagName: "input",
      role: "combobox",
      ariaLabel: "Search",
      placeholder: "Search",
    });
    expect(diagnostics.overlayTextSample).toContain("Pentanom");

    await page.close();
  });

  it("recognizes changed modal button text like Continue as the next Easy Apply action", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="jobs-easy-apply-modal" role="dialog">
        <header><h2>Apply to Pentanom</h2></header>
        <section><h3>Additional questions</h3></section>
        <footer>
          <button id="continue-button" type="button">
            <span class="artdeco-button__text">Continue</span>
          </button>
        </footer>
      </div>
      <script>
        document.getElementById("continue-button").addEventListener("click", () => {
          document.body.setAttribute("data-continued", "true");
        });
      </script>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.collectStepState()).resolves.toEqual({
      modalTitle: "Apply to Pentanom",
      headingText: "Additional questions",
      primaryAction: "next",
      buttonLabels: ["Continue"],
    });
    await expect(driver.getPrimaryAction()).resolves.toBe("next");
    await driver.advance("next");
    expect(await page.locator("body").getAttribute("data-continued")).toBe("true");

    await page.close();
  });

  it("surfaces loading/interstitial modal context when buttons have not rendered yet", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="jobs-easy-apply-modal" role="dialog">
        <header><h2>Apply to OBSS</h2></header>
        <div aria-live="polite">Loading application questions...</div>
      </div>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const state = await driver.collectStepState();
    const diagnostics = await driver.collectUnknownActionDiagnostics();

    expect(state).toEqual({
      modalTitle: "Apply to OBSS",
      headingText: null,
      primaryAction: "unknown",
      buttonLabels: [],
    });
    expect(diagnostics.modalHtmlSample).toContain("Loading application questions");
    expect(diagnostics.overlayTextSample).toContain("Apply to OBSS");

    await page.close();
  });

  it("dismisses the application-sent modal through the X button when Not now is not present", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInApplicationSentModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const dismissed = await driver.dismissCompletionModal();

    expect(dismissed).toBe(true);
    expect(await page.locator(".jpac-modal-header").count()).toBe(0);

    await page.close();
  });

  it("detects already-applied linkedin jobs from the see-application badge", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="jobs-s-apply jobs-s-apply--fadein inline-flex mr2">
        <div class="artdeco-inline-feedback artdeco-inline-feedback--success" role="alert">
          <span class="artdeco-inline-feedback__message">Applied 4 minutes ago</span>
        </div>
        <a id="jobs-apply-see-application-link" href="/jobs-tracker?stage=applied" class="jobs-s-apply__application-link">
          See application
          <span class="a11y-text">Applied 4 minutes ago for Full Stack Engineer</span>
        </a>
      </div>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const alreadyApplied = await driver.isAlreadyApplied();

    expect(alreadyApplied).toBe(true);

    await page.close();
  });

  it("waits for a hydrated applied badge in the matching search detail panel", async () => {
    const page = await browser.newPage();
    await page.route("https://www.linkedin.com/**", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `
          <main class="jobs-details"><div id="status"></div></main>
          <script>
            setTimeout(() => {
              document.querySelector('#status').innerHTML = \`
                <div class="jobs-s-apply">
                  <span class="artdeco-inline-feedback__message">Applied 3 hours ago</span>
                  <a id="jobs-apply-see-application-link" href="/jobs-tracker?stage=applied">
                    See application
                  </a>
                </div>
              \`;
            }, 500);
          </script>
        `,
      });
    });
    await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4453899034");

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(
      driver.inspectJobApplicationState(
        "https://www.linkedin.com/jobs/view/4453899034",
      ),
    ).resolves.toBe("already_applied");

    await page.close();
  });

  it("confirms a stable Easy Apply surface as available", async () => {
    const page = await browser.newPage();
    await page.route("https://www.linkedin.com/**", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `
          <main class="jobs-details">
            <button aria-label="Easy Apply to Backend Developer">Easy Apply</button>
          </main>
        `,
      });
    });
    await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4453899034");

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(
      driver.inspectJobApplicationState(
        "https://www.linkedin.com/jobs/view/4453899034",
      ),
    ).resolves.toBe("apply_available");

    await page.close();
  });

  it("collects jobs from current LinkedIn search result cards", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <ul>
        <li data-occludable-job-id="4443235445">
          <a href="https://www.linkedin.com/jobs/view/4443235445/?trackingId=test">Software Engineer</a>
        </li>
        <li data-occludable-job-id="4444570774">Applied
          <a href="https://www.linkedin.com/jobs/view/4444570774/">Software Specialist</a>
        </li>
      </ul>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.collectVisibleJobs()).resolves.toEqual([
      { url: "https://www.linkedin.com/jobs/view/4443235445", alreadyApplied: false },
      { url: "https://www.linkedin.com/jobs/view/4444570774", alreadyApplied: true },
    ]);

    await page.close();
  });

  it("collects a job when LinkedIn exposes only its job link", async () => {
    const page = await browser.newPage();
    await page.setContent(
      '<a href="https://www.linkedin.com/jobs/view/4443235445/?trackingId=test">Software Engineer</a>',
    );

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.collectVisibleJobs()).resolves.toEqual([
      { url: "https://www.linkedin.com/jobs/view/4443235445", alreadyApplied: false },
    ]);

    await page.close();
  });

  it("waits for LinkedIn search cards instead of treating the selected detail link as the whole batch", async () => {
    const page = await browser.newPage();
    await page.route("https://www.linkedin.com/**", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `
          <main>
            <a href="/jobs/view/4453899034/">Selected job details</a>
            <ul id="results"></ul>
          </main>
          <script>
            setTimeout(() => {
              document.querySelector('#results').innerHTML = [
                '<li data-occludable-job-id="4453899034"><a href="/jobs/view/4453899034/">Backend Developer</a></li>',
                '<li data-occludable-job-id="4408633820"><a href="/jobs/view/4408633820/">Software Engineer</a></li>',
              ].join('');
            }, 700);
          </script>
        `,
      });
    });
    await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4453899034");
    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.collectVisibleJobs()).resolves.toEqual([
      { url: "https://www.linkedin.com/jobs/view/4453899034", alreadyApplied: false },
      { url: "https://www.linkedin.com/jobs/view/4408633820", alreadyApplied: false },
    ]);

    await page.close();
  });

  it("scrolls a virtualized LinkedIn result list and accumulates replaced cards", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="jobs-search-results-list" style="height: 120px; overflow-y: auto">
        <ul id="results" style="margin: 0; padding: 0">
          <li data-occludable-job-id="4443235445" style="height: 120px">
            <a href="https://www.linkedin.com/jobs/view/4443235445/?trackingId=first">Software Engineer</a>
          </li>
          <li data-occludable-job-id="4444570774" style="height: 120px">
            Applied <a href="https://www.linkedin.com/jobs/view/4444570774/">Software Specialist</a>
          </li>
        </ul>
      </div>
      <script>
        document.querySelector('.jobs-search-results-list').addEventListener('scroll', () => {
          const results = document.querySelector('#results');
          if (results.dataset.replaced) return;
          results.dataset.replaced = 'true';
          results.innerHTML = [
            '<li data-occludable-job-id="4449010001" style="height: 120px">',
            '<a href="https://www.linkedin.com/jobs/view/4449010001/">Platform Engineer</a>',
            '</li>',
            '<li data-occludable-job-id="4449010002" style="height: 120px">',
            '<a href="https://www.linkedin.com/jobs/view/4449010002/">Applied Scientist</a>',
            '</li>',
          ].join('');
        });
      </script>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.collectVisibleJobs()).resolves.toEqual([
      { url: "https://www.linkedin.com/jobs/view/4443235445", alreadyApplied: false },
      { url: "https://www.linkedin.com/jobs/view/4444570774", alreadyApplied: true },
      { url: "https://www.linkedin.com/jobs/view/4449010001", alreadyApplied: false },
      { url: "https://www.linkedin.com/jobs/view/4449010002", alreadyApplied: false },
    ]);

    await page.close();
  });

  it("returns false when the next-page control does not change pagination state", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <ul>
        <li data-occludable-job-id="4443235445">
          <a href="https://www.linkedin.com/jobs/view/4443235445/">Software Engineer</a>
        </li>
      </ul>
      <button class="jobs-search-pagination__button--next">Next</button>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page, {
      paginationChangeTimeoutMs: 60,
      paginationPollIntervalMs: 10,
    });

    await expect(driver.goToNextResultsPage()).resolves.toBe(false);
    expect(driver.getLastPaginationStopReason()).toEqual({
      code: "results_unchanged_timeout",
      message: "The LinkedIn results did not change after the next-page control was clicked.",
    });

    await page.close();
  });

  it("explains when LinkedIn exposes no next-page control", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <ul><li data-occludable-job-id="1">Only result</li></ul>
    `);
    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.goToNextResultsPage()).resolves.toBe(false);
    expect(driver.getLastPaginationStopReason()).toEqual({
      code: "next_control_missing",
      message: "No next-page control was present on the LinkedIn results page.",
    });
    await page.close();
  });

  it("explains when LinkedIn disables the next-page control", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <ul><li data-occludable-job-id="1">Only result</li></ul>
      <button class="jobs-search-pagination__button--next" disabled>Next</button>
    `);
    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.goToNextResultsPage()).resolves.toBe(false);
    expect(driver.getLastPaginationStopReason()).toEqual({
      code: "next_control_disabled",
      message: "The LinkedIn next-page control was disabled.",
    });
    await page.close();
  });

  it("waits for a changed job-id fingerprint before confirming the next page", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <ul id="results">
        <li data-occludable-job-id="4443235445">
          <a href="https://www.linkedin.com/jobs/view/4443235445/">Software Engineer</a>
        </li>
      </ul>
      <button id="next" class="jobs-search-pagination__button--next">Next</button>
      <script>
        document.querySelector('#next').addEventListener('click', () => {
          setTimeout(() => {
            document.querySelector('#results').innerHTML =
              '<li data-occludable-job-id="4444570774"><a href="https://www.linkedin.com/jobs/view/4444570774/">Platform Engineer</a></li>';
          }, 30);
        });
      </script>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page, {
      paginationChangeTimeoutMs: 500,
      paginationPollIntervalMs: 10,
    });

    await expect(driver.goToNextResultsPage()).resolves.toBe(true);
    expect(driver.getLastPaginationStopReason()).toBeNull();
    await expect(driver.collectVisibleJobs()).resolves.toEqual([
      { url: "https://www.linkedin.com/jobs/view/4444570774", alreadyApplied: false },
    ]);

    await page.close();
  });

  it("continues past the job search safety reminder modal instead of stopping on it", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInSafetyReminderModalHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    await driver.openEasyApply();
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to TravelShop Turkey",
      headingText: null,
      primaryAction: "review",
      buttonLabels: ["Review"],
    });

    await page.close();
  });

  it("continues past the safety reminder when LinkedIn renders it without role=dialog", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInSafetyReminderNoDialogHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    await driver.openEasyApply();
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to TravelShop Turkey",
      headingText: null,
      primaryAction: "review",
      buttonLabels: ["Review"],
    });

    await page.close();
  });

  it("adopts the popup page when LinkedIn opens the safety reminder in a new tab", async () => {
    const page = await browser.newPage();
    const popupPage = await browser.newPage();
    await page.setContent(`
      <button id="easy-apply-trigger" type="button" aria-label="Easy Apply to TravelShop Turkey">
        Easy Apply
      </button>
    `);
    await popupPage.goto(`data:text/html,${encodeURIComponent(`
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
        aria-labelledby="jobs-apply-header"
      >
        <div class="artdeco-modal__header ember-view">
          <h2 id="jobs-apply-header">Apply to TravelShop Turkey</h2>
        </div>
        <div class="artdeco-modal__content jobs-easy-apply-modal__content p0 ember-view">
          <form>
            <footer role="presentation">
              <div class="display-flex justify-flex-end ph5 pv4">
                <button aria-label="Review your application" data-live-test-easy-apply-review-button="" type="button">
                  <span class="artdeco-button__text">Review</span>
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>
    `)}`);
    vi.spyOn(page, "waitForEvent").mockResolvedValue(popupPage as never);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    await driver.openEasyApply();
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to TravelShop Turkey",
      headingText: null,
      primaryAction: "review",
      buttonLabels: ["Review"],
    });
    expect(page.context().pages().filter((candidate) => !candidate.isClosed())).toHaveLength(1);
  });

  it("ignores about:blank popups and keeps the original page active", async () => {
    const page = await browser.newPage();
    const blankPopup = await browser.newPage();
    await page.setContent(`
      <button id="easy-apply-trigger" type="button" aria-label="Easy Apply to TravelShop Turkey">
        Easy Apply
      </button>
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
        aria-labelledby="jobs-apply-header"
      >
        <div class="artdeco-modal__header ember-view">
          <h2 id="jobs-apply-header">Apply to TravelShop Turkey</h2>
        </div>
        <div class="artdeco-modal__content jobs-easy-apply-modal__content p0 ember-view">
          <form>
            <footer role="presentation">
              <div class="display-flex justify-flex-end ph5 pv4">
                <button aria-label="Review your application" data-live-test-easy-apply-review-button="" type="button">
                  <span class="artdeco-button__text">Review</span>
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>
    `);
    vi.spyOn(page, "waitForEvent").mockResolvedValue(blankPopup as never);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    await driver.openEasyApply();
    const result = await driver.collectStepState();

    expect(result).toEqual({
      modalTitle: "Apply to TravelShop Turkey",
      headingText: null,
      primaryAction: "review",
      buttonLabels: ["Review"],
    });
    expect(blankPopup.isClosed()).toBe(true);
  });

  it("confirms the external application completion prompt by clicking Yes", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <div>
          <p>Did you finish applying?</p>
          <p>You'll find this job under <strong>In progress</strong>.</p>
          <a href="#">Yes</a>
          <button type="button">No</button>
        </div>
      </main>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const confirmed = await driver.confirmExternalApplicationFinished();

    expect(confirmed).toBe(true);
    await page.close();
  });

  it("detects external apply from the off-linkedin response signal plus header apply CTA", async () => {
    const page = await browser.newPage();
    await page.setContent(linkedInExternalApplyHeaderHtml);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);

    await expect(driver.isExternalApplyAvailable()).resolves.toBe(true);
    await expect(driver.getExternalApplyUrl()).resolves.toBe(
      "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjobs%2Elever%2Eco%2Fcommencis%2Fa3be10ef-53ab-4842-b114-ae9f60b43e99&urlhash=kEke&isSdui=true",
    );

    await page.close();
  });

  it("accepts a generic LinkedIn apply button only with the off-linkedin signal", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <p>Responses managed off LinkedIn</p>
        <button class="jobs-apply-button" role="link">Apply</button>
      </main>
    `);
    const driver = new PlaywrightLinkedInEasyApplyDriver(page, {
      externalApplyDetectionTimeoutMs: 0,
    });

    await expect(driver.isExternalApplyAvailable()).resolves.toBe(true);
    await expect(driver.getExternalApplyDetection()).resolves.toEqual({
      source: "header_apply_fallback",
      signals: [
        "signal:responses_managed_off_linkedin",
        "selector:header_apply_fallback",
      ],
    });
    await page.close();
  });

  it("rejects a generic apply button when no off-linkedin evidence is present", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <main><button class="jobs-apply-button" role="link">Apply</button></main>
    `);
    const driver = new PlaywrightLinkedInEasyApplyDriver(page, {
      externalApplyDetectionTimeoutMs: 0,
    });

    await expect(driver.isExternalApplyAvailable()).resolves.toBe(false);
    await expect(driver.getExternalApplyDetection()).resolves.toBeNull();
    await page.close();
  });

  it("waits briefly for a delayed external apply control to render", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <main id="job"><p>Responses managed off LinkedIn</p></main>
      <script>
        setTimeout(() => {
          const button = document.createElement('button');
          button.className = 'jobs-apply-button';
          button.setAttribute('role', 'link');
          button.textContent = 'Apply';
          document.querySelector('#job').appendChild(button);
        }, 30);
      </script>
    `);
    const driver = new PlaywrightLinkedInEasyApplyDriver(page, {
      externalApplyDetectionTimeoutMs: 300,
      externalApplyDetectionPollIntervalMs: 10,
    });

    await expect(driver.isExternalApplyAvailable()).resolves.toBe(true);
    await expect(driver.getExternalApplyDetection()).resolves.toMatchObject({
      source: "header_apply_fallback",
    });
    await page.close();
  });

  it("still detects an explicit company website CTA without the fallback signal", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <button aria-label="Apply to Acme on company website">Apply</button>
    `);
    const driver = new PlaywrightLinkedInEasyApplyDriver(page, {
      externalApplyDetectionTimeoutMs: 0,
    });

    await expect(driver.isExternalApplyAvailable()).resolves.toBe(true);
    await expect(driver.getExternalApplyDetection()).resolves.toMatchObject({
      source: "explicit_company_website_cta",
    });
    await page.close();
  });

  it("reuses a matching job-detail surface without redundant navigation", async () => {
    const context = await browser.newContext();
    try {
      let navigationCount = 0;
      await context.route("https://www.linkedin.com/**", async (route) => {
        navigationCount += 1;
        await route.fulfill({
          contentType: "text/html",
          body: `
            <main class="jobs-details">
              <button aria-label="Easy Apply to Backend Developer">Easy Apply</button>
            </main>
          `,
        });
      });
      const page = await context.newPage();
      const jobUrl = "https://www.linkedin.com/jobs/view/4453899034/";
      await page.goto(jobUrl);
      const driver = new PlaywrightLinkedInEasyApplyDriver(page);

      await expect(driver.inspectJobApplicationState(jobUrl)).resolves.toBe(
        "apply_available",
      );
      await driver.open(jobUrl);

      expect(navigationCount).toBe(1);
    } finally {
      await context.close();
    }
  });

  it("captures the real HTTPS destination from an href-less external apply button", async () => {
    const context = await browser.newContext();
    try {
      await context.route("https://jobs.example.com/**", async (route) => {
        await route.fulfill({
          contentType: "text/html",
          body: "<main><h1>External application</h1></main>",
        });
      });
      const page = await context.newPage();
      await page.setContent(`
        <main>
          <button
            id="jobs-apply-button-id"
            role="link"
            aria-label="Apply to Example on company website"
            onclick="window.open('https://jobs.example.com/apply/4456490821', '_blank')"
          >
            Apply
          </button>
        </main>
      `);

      const driver = new PlaywrightLinkedInEasyApplyDriver(page);

      await expect(driver.getExternalApplyUrl()).resolves.toBe(
        "https://jobs.example.com/apply/4456490821",
      );
      await driver.dispose();
    } finally {
      await context.close();
    }
  });

  it("marks linkedin numeric text inputs as decimal fields and captures inline validation text", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
      >
        <div class="fb-dash-form-element">
          <div class="artdeco-text-input">
            <div class="artdeco-text-input--container">
              <label for="salary-field-numeric">Net ücret beklentiniz nedir?</label>
              <input
                id="salary-field-numeric"
                class="fb-dash-form-element__error-field artdeco-text-input--input"
                aria-describedby="salary-field-numeric-error"
                type="text"
                inputmode="text"
                required
              />
            </div>
          </div>
          <div id="salary-field-numeric-error">
            <div class="artdeco-inline-feedback artdeco-inline-feedback--error" role="alert">
              <span class="artdeco-inline-feedback__message">0.0 değerinden büyük bir decimal sayısı girin</span>
            </div>
          </div>
        </div>
        <footer role="presentation">
          <button aria-label="Review your application" data-live-test-easy-apply-review-button="" type="button">
            <span class="artdeco-button__text">Review</span>
          </button>
        </footer>
      </div>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const questions = await driver.collectQuestions();
    const diagnostics = await driver.collectReviewDiagnostics();

    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      label: "Net ücret beklentiniz nedir?",
      expectsDecimal: true,
      validationMessage: "0.0 değerinden büyük bir decimal sayısı girin",
    });
    expect(diagnostics.validationMessages).toContain("0.0 değerinden büyük bir decimal sayısı girin");
    expect(diagnostics.blockingFields[0]).toMatchObject({
      label: "Net ücret beklentiniz nedir?",
      validationMessage: "0.0 değerinden büyük bir decimal sayısı girin",
      required: true,
    });

    await page.close();
  });

  it("refuses to fill non-numeric answers into linkedin decimal fields", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
      >
        <div class="fb-dash-form-element">
          <label for="salary-field-numeric">Net ücret beklentiniz nedir?</label>
          <input id="salary-field-numeric" type="text" inputmode="text" />
        </div>
      </div>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const [question] = await driver.collectQuestions();
    const result = await driver.fillAnswer(question, {
      questionType: "salary",
      strategy: "generated",
      answer: "negotiable",
      confidence: 0.7,
      confidenceLabel: "medium",
      source: "llm",
    });

    expect(result).toEqual({
      filled: false,
      details: "Expected a numeric answer greater than 0 for this LinkedIn field.",
    });
    expect(await page.locator("#salary-field-numeric").inputValue()).toBe("");

    await page.close();
  });

  it("returns LinkedIn inline validation after filling a numeric field", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <div
        data-test-modal=""
        role="dialog"
        tabindex="-1"
        class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal"
      >
        <div class="fb-dash-form-element">
          <div class="artdeco-text-input">
            <div class="artdeco-text-input--container">
              <label for="salary-field-numeric">Net ücret beklentiniz nedir?</label>
              <input
                id="salary-field-numeric"
                type="text"
                inputmode="text"
                aria-describedby="salary-field-numeric-error"
              />
            </div>
          </div>
          <div id="salary-field-numeric-error">
            <div class="artdeco-inline-feedback artdeco-inline-feedback--error" role="alert">
              <span class="artdeco-inline-feedback__message"></span>
            </div>
          </div>
        </div>
      </div>
      <script>
        const input = document.getElementById("salary-field-numeric");
        const message = document.querySelector(".artdeco-inline-feedback__message");
        input.addEventListener("blur", () => {
          if (input.value === "1") {
            message.textContent = "0.0 değerinden büyük bir decimal sayısı girin";
            input.setAttribute("aria-invalid", "true");
          }
        });
      </script>
    `);

    const driver = new PlaywrightLinkedInEasyApplyDriver(page);
    const [question] = await driver.collectQuestions();
    const result = await driver.fillAnswer(question, {
      questionType: "salary",
      strategy: "generated",
      answer: "1",
      confidence: 0.7,
      confidenceLabel: "medium",
      source: "llm",
    });

    expect(result).toEqual({
      filled: false,
      details: "0.0 değerinden büyük bir decimal sayısı girin",
    });

    await page.close();
  });
});
