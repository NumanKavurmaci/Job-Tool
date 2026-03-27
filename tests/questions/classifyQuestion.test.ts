import { describe, expect, it } from "vitest";
import { classifyQuestion } from "../../src/questions/classifyQuestion.js";

describe("classifyQuestion", () => {
  it.each([
    [{ label: "LinkedIn Profile", inputType: "text" }, "linkedin"],
    [{ label: "What is your email address?", inputType: "text" }, "contact_info"],
    [{ label: "What is your phone number?", inputType: "text" }, "contact_info"],
    [{ label: "Are you legally authorized to work in Germany?", inputType: "radio" }, "work_authorization"],
    [
      {
        label: "Will you now or in the future require sponsorship for employment visa status?",
        inputType: "radio",
      },
      "sponsorship",
    ],
    [{ label: "Are you willing to relocate?", inputType: "radio" }, "relocation"],
    [{ label: "What is your current city or location?", inputType: "text" }, "location"],
    [{ label: "What is your expected salary?", inputType: "text" }, "salary"],
    [{ label: "How many years of experience do you have with React?", inputType: "text" }, "years_of_experience"],
    [{ label: "Briefly describe your experience with TypeScript.", inputType: "textarea" }, "skill_experience"],
    [{ label: "Tell us about a project you are proud of.", inputType: "textarea" }, "general_short_text"],
    [{ label: "When can you start? What is your notice period?", inputType: "text" }, "availability"],
    [{ label: "Why are you interested in this role?", inputType: "textarea" }, "motivation_short_text"],
  ])("classifies common LinkedIn-style questions: %o -> %s", (question, expectedType) => {
    expect(classifyQuestion(question).type).toBe(expectedType);
  });
});
