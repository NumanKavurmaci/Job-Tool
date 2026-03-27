export const linkedInCrossingHurdlesFixture = {
  pageTitle: "Software Engineer (Fullstack) | Remote | Crossing Hurdles | LinkedIn",
  titleText: "Software Engineer (Fullstack) | Remote",
  aboutCollapsed: [
    "Position: Fullstack Developer (Python/React)",
    "Type: Full-time",
    "Compensation: $230K–$280K/year",
    "Location: Remote",
    "Commitment: 40 hours/week",
    "Role Responsibilities",
    "Build and maintain scalable backend APIs using Python and frameworks such as FastAPI.",
    "Develop frontend applications using React, Next.js, and TypeScript.",
    "Integrate LLMs and AI-driven workflows into production systems.",
    "Implement backend optimizations, including concurrency patterns and performance improvements.",
    "Write and optimize SQL queries and contribute to data modeling.",
    "Improve platform scalability, reliability, and performance across the full stack.",
    "Debug, troubleshoot, and resolve system issues to ensure stability.",
    "Write clean, modular, and maintainable code following best engineering practices.",
    "Collaborate closely with a senior remote team to deliver high-quality features efficiently.",
    "Requirements",
    "Strong experience building frontend applications using React (Next.js and TypeScript preferred).",
    "Proficiency in Python for backend development (FastAPI or similar frameworks).",
    "Solid understanding of asynchronous programming and performance optimization.",
    "Experience writing and debugging SQL queries.",
    "Familiarity with APIs and service-oriented architectures.",
    "Exposure to cloud platforms such as AWS.",
    "Strong problem-solving skills and effective communication.",
    "Ownership mindset with ability to work independently in a fast-paced environment.",
    "Application Process (Takes 20 Min)",
    "Upload resume",
    "Interview (15 min)",
    "Submit form",
    "… more",
  ].join("\n"),
  badges: "$230K/yr - $280K/yr\nRemote\nContract",
  noisyBody: [
    "Software Engineer (Fullstack) | Remote | Crossing Hurdles | LinkedIn",
    "Türkiye (Remote)",
    "About the company",
    "Crossing Hurdles",
    "Staffing and Recruiting",
  ].join("\n"),
};

export const linkedInExternalApplyFixture = {
  pageTitle: "Senior Fullstack Developer | Proxify | LinkedIn",
  titleText: "Senior Fullstack Developer",
  companyText: "Proxify",
  bodyText: [
    "Senior Fullstack Developer",
    "Apply to Senior Fullstack Developer on company website",
    "Remote",
    "Save",
  ].join("\n"),
  aboutExpanded: [
    "About the job",
    "Build remote-first fullstack applications.",
    "Requirements",
    "Strong TypeScript experience.",
  ].join("\n"),
};

export const linkedInPreReviewModalHtml = `
<div data-test-modal="" role="dialog" tabindex="-1" class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal" size="large" aria-labelledby="jobs-apply-header">
  <div class="artdeco-modal__header ember-view">
    <h2 id="jobs-apply-header">Apply to Crossing Hurdles</h2>
  </div>
  <div class="artdeco-modal__content jobs-easy-apply-modal__content p0 ember-view">
    <div tabindex="-1" aria-label="Your job application progress is at 75 percent." role="region">
      <div class="display-flex ph5 pv2">
        <progress max="100" value="75" class="artdeco-completeness-meter-linear__progress-element"></progress>
        <span class="pl3 t-14 t-black--light">75%</span>
      </div>
      <div>
        <form>
          <div class="jobs-easy-apply-repeatable-groupings__groupings mb5">
            <h3 class="t-16 mb2"><span class="t-bold">Education</span></h3>
            <div class="artdeco-card Elevation-0dp p2 mb1">
              <div class="mb1">
                <span class="t-12 t-black--light mr1 jobs-easy-apply-repeatable-grouping-preview__title--is-required">School</span>
                <span class="t-14">Karabuk University</span>
              </div>
              <div class="mb1">
                <span class="t-12 t-black--light mr1">City</span>
                <span class="t-14">– –</span>
              </div>
            </div>
          </div>
          <footer role="presentation">
            <div class="display-flex justify-flex-end ph5 pv4">
              <button aria-label="Back to previous step" type="button"><span class="artdeco-button__text">Back</span></button>
              <button aria-label="Review your application" data-live-test-easy-apply-review-button="" type="button"><span class="artdeco-button__text">Review</span></button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  </div>
</div>
`.trim();

export const linkedInReviewModalHtml = `
<div data-test-modal="" role="dialog" tabindex="-1" class="artdeco-modal artdeco-modal--layer-default jobs-easy-apply-modal" size="large" aria-labelledby="jobs-apply-header">
  <div class="artdeco-modal__header ember-view">
    <h2 id="jobs-apply-header">Apply to Crossing Hurdles</h2>
  </div>
  <div class="artdeco-modal__content jobs-easy-apply-modal__content p0 ember-view">
    <div tabindex="-1" aria-label="Your job application progress is at 100 percent." role="region">
      <div class="display-flex ph5 pv2">
        <progress max="100" value="100" class="artdeco-completeness-meter-linear__progress-element"></progress>
        <span class="pl3 t-14 t-black--light">100%</span>
      </div>
      <div>
        <div class="ph5">
          <h3 class="t-18">Review your application</h3>
          <div class="t-14 t-black--light">The employer will also receive a copy of your profile.</div>
        </div>
        <footer role="presentation">
          <div class="display-flex justify-flex-end ph5 pv4">
            <button aria-label="Back to previous step" type="button"><span class="artdeco-button__text">Back</span></button>
            <button aria-label="Submit application" data-live-test-easy-apply-submit-button="" type="button"><span class="artdeco-button__text">Submit application</span></button>
          </div>
        </footer>
      </div>
    </div>
  </div>
</div>
`.trim();
