export const leverPrecursorPageHtml = `
<div class="section-wrapper page-full-width">
  <div class="section page-centered" data-qa="job-description">
    <div>
      <span style="font-size: 16px;">We are currently seeking a highly skilled </span>
      <strong style="font-size: 16px;">Senior Web Frontend Engineer</strong>
      <span style="font-size: 16px;"> to join our team.</span>
    </div>
  </div>
  <div class="section page-centered">
    <div><h3>Responsibilities</h3></div>
  </div>
  <div class="section page-centered">
    <div><h3>Qualifications</h3></div>
  </div>
  <div class="section page-centered last-section-apply" data-qa="btn-apply-bottom">
    <a
      class="postings-btn template-btn-submit hex-color"
      data-qa="show-page-apply"
      href="https://jobs.lever.co/commencis/a3be10ef-53ab-4842-b114-ae9f60b43e99/apply"
    >
      apply for this job
    </a>
  </div>
</div>
`.trim();

export const greenhousePrecursorPageHtml = `
<main>
  <section>
    <h1>Frontend Engineer</h1>
    <p>Apply for this job</p>
    <a href="https://boards.greenhouse.io/example/jobs/1234567/apply">Apply for this job</a>
  </section>
</main>
`.trim();

export const ashbyEmbeddedHostPageHtml = `
<main>
  <div id="ashby_embed">
    <iframe
      id="ashby_embed_iframe"
      src="https://jobs.ashbyhq.com/10xteam/32d15c28-c3e9-4afd-8f2e-e4ab81a3e06e?utm_source=LinkedInPaid&embed=js"
      title="Ashby Job Board"
      width="100%"
      height="2200"
      frameborder="0"
      scrolling="no"
    ></iframe>
  </div>
</main>
`.trim();

export const icimsEmbeddedHostPageHtml = `
<main>
  <iframe
    id="icims_content_iframe"
    src="https://globalcareers-githubinc.icims.com/jobs/5151/login?iis=Job+Board&iisn=LinkedIn&in_iframe=1"
    title="iCIMS Content iFrame"
  ></iframe>
</main>
`.trim();

export const workdayPrecursorPageHtml = `
<main>
  <section>
    <h1>Senior Frontend Engineer</h1>
    <p>Continue to application</p>
    <a href="https://example.wd1.myworkdayjobs.com/en-US/Careers/job/Istanbul/apply">Continue to application</a>
  </section>
</main>
`.trim();

export const breezyPersonalDetailsFormHtml = `
<div class="section">
  <div class="section-header"><h2 class="polygot">Personal Details</h2></div>
  <h3><span class="polygot">Full Name</span><span title="Required" class="required">*</span></h3>
  <input name="cName" ng-model="candidate.name" type="text" placeholder="Full Name" required="" class="polygot ng-dirty ng-valid ng-valid-required">
  <div ng-show="formSubmitted || sectionSubmitted" class="error-container ng-hide"><span ng-show="form.cName.$error.required" class="error polygot ng-hide">A full name is required</span></div>
  <div class="form-divider"></div>
  <h3><span class="polygot">Email Address</span><span title="Required" class="required">*</span></h3>
  <input name="cEmail" ng-model="candidate.email_address" type="email" placeholder="Email Address" required="" class="email-address polygot ng-valid-email ng-dirty ng-valid ng-valid-required">
  <div ng-show="formSubmitted || sectionSubmitted" class="error-container ng-hide">
    <span ng-show="form.cEmail.$error.required" class="error polygot ng-hide">An email is required</span>
    <span ng-show="form.cEmail.$error.email" class="error polygot ng-hide">An email is required</span>
  </div>
  <div class="form-divider"></div>
  <h3><span class="polygot">Phone Number</span><span title="Required" class="required">*</span></h3>
  <input name="cPhoneNumber" ng-model="candidate.phone_number" type="text" placeholder="Phone Number" required="" class="phone-number polygot ng-dirty ng-valid ng-valid-required">
  <div ng-show="formSubmitted || sectionSubmitted" class="error-container ng-hide"><span ng-show="form.cPhoneNumber.$error.required" class="error polygot ng-hide">A phone number is required</span></div>
  <ul class="options">
    <li class="option consent-form">
      <input type="checkbox" name="smsConsent" ng-model="$storage[positionId].sms_consent" class="ng-pristine ng-valid">
      <span ng-bind="getSmsConsentText()" class="polygot ng-binding">By providing your phone number you agree to receive informational text messages from Udext. Udext will send updates about your application via SMS. Message &amp; data rates may apply, reply STOP to opt out at any time.</span>
    </li>
  </ul>
  <div ng-show="formSubmitted || sectionSubmitted" class="error-container ng-hide"><span ng-show="form.smsConsent.$error.required" class="error polygot ng-hide">Please agree to receive SMS messages</span></div>
  <div class="form-divider"></div>
  <div class="desired-salary">
    <h3><span class="polygot">Desired Salary</span></h3>
    <span ng-if="currencies.length &gt; 1" class="ng-scope">
      <select name="salaryCurrency" class="salary-details options-dropdown ng-pristine ng-valid">
        <option value="USD">US Dollar ($)</option>
        <option value="TRY">Turkish Lira (TL)</option>
      </select>
    </span>
    <input name="cSalary" ng-model="candidate.salary.salary" type="text" ng-change="stripNonNumeric()" placeholder="Desired Salary" ng-required="position.application_form.salary==='required'" class="salary-number polygot ng-pristine placeholder ng-valid ng-valid-required">
    <select ng-model="candidate.salary.period" ng-options="item.label for item in salaryFreq track by item._id" ng-required="position.application_form.salary==='required'" class="salary-details ng-pristine ng-valid ng-valid-required" name="salaryPeriod">
      <option value="hourly">Hourly</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
      <option value="yearly">Yearly</option>
    </select>
    <div ng-show="formSubmitted || sectionSubmitted" class="error-container ng-hide"><span ng-show="form.cSalary.$error.required" class="error polygot ng-hide">Desired salary is required</span></div>
    <div class="form-divider"></div>
  </div>
</div>
`.trim();

export const breezyResumeButtonsHtml = `
<ul class="apply-buttons apply-buttons-3">
  <li class="apply-button">
    <div class="file-input-container type">
      <a
        ng-class="candidate && candidate.resume.file_name ? 'gray' : 'blue'"
        ng-click="$event.preventDefault(); showFileSelector();"
        ng-disabled="uploadingResume"
        class="polygot-parent button resume btn-flex-center blue"
      >
        <div ng-if="!uploadingResume && !candidate.resume.file_name" class="app-resume-btn ng-scope">
          <i class="fas fa-upload"></i>
          <span> </span>
          <span class="polygot">Upload Resume</span>
          <span ng-show="resumeRequired" title="Required" class="required">*</span>
        </div>
      </a>
    </div>
  </li>
  <li class="apply-button">
    <a onclick="openPopup(event)" class="polygot-parent button blue indeed button-indeed btn-flex-center">
      <img src="https://assets-cdn.breezy.hr/breezy-portal/images/indeed-icon.png">
      <span> </span>
      <span class="polygot">Use My Indeed Resume</span>
    </a>
  </li>
  <li class="apply-button">
    <a target="_self" href="https://app.breezy.hr/api/apply/linkedin?position_id=9450b95287c4" class="button blue linkedin btn-flex-center">
      <i class="fas fa-brands fa-linkedin"></i>
      <span class="polygot">Apply Using LinkedIn</span>
    </a>
  </li>
</ul>
`.trim();

export const workableSingleStepFormHtml = `
<main>
  <form>
    <label for="candidate_name">Full name</label>
    <input id="candidate_name" name="candidate_name" type="text" placeholder="Full name" required>

    <label for="candidate_email">Email</label>
    <input id="candidate_email" name="candidate_email" type="email" placeholder="Email" required>

    <label for="candidate_portfolio">Portfolio URL</label>
    <input id="candidate_portfolio" name="candidate_portfolio" type="url" placeholder="Portfolio URL">

    <label for="candidate_salary_currency">Salary currency</label>
    <select id="candidate_salary_currency" name="candidate_salary_currency">
      <option>US Dollar ($)</option>
      <option>Turkish Lira (TL)</option>
    </select>

    <label for="candidate_salary_amount">Expected salary</label>
    <input id="candidate_salary_amount" name="candidate_salary_amount" type="number" placeholder="Expected salary">

    <label for="candidate_resume">Resume</label>
    <input id="candidate_resume" name="candidate_resume" type="file" accept=".pdf">

    <label>
      <input id="candidate_privacy" name="candidate_privacy" type="checkbox">
      I agree to the privacy policy
    </label>

    <button type="submit">Submit application</button>
  </form>
</main>
`.trim();
