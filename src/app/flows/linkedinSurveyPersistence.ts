import type { AppDeps } from "../deps.js";
import type {
  EasyApplyAnsweredQuestion,
  EasyApplyStepReport,
} from "../../linkedin/easyApply.js";
import { persistSystemEvent } from "../observability.js";
import type { EasyApplyRunType } from "./linkedinRunMeta.js";

function collectAnsweredQuestions(steps: EasyApplyStepReport[]): EasyApplyAnsweredQuestion[] {
  return steps.flatMap((step) => step.questions ?? []);
}

function buildPreparedSurveyPayload(steps: EasyApplyStepReport[]) {
  const answeredQuestions = collectAnsweredQuestions(steps);
  if (answeredQuestions.length === 0) {
    return null;
  }

  return {
    questions: answeredQuestions.map((entry) => entry.question),
    answers: answeredQuestions.map((entry, index) => ({
      order: index,
      question: entry.question,
      resolved: entry.resolved,
      filled: entry.filled,
      ...(entry.details ? { details: entry.details } : {}),
    })),
  };
}

async function createCandidateProfileSnapshotForSurvey(args: {
  profile: Awaited<ReturnType<AppDeps["loadCandidateMasterProfile"]>>;
  deps: AppDeps;
}) {
  return args.deps.prisma.candidateProfileSnapshot.create({
    data: {
      fullName: args.profile.fullName,
      linkedinUrl: args.profile.linkedinUrl ?? null,
      resumePath: args.profile.sourceMetadata.resumePath ?? null,
      profileJson: JSON.stringify(args.profile),
    },
  });
}

export async function persistEasyApplySurveyAnswers(args: {
  results: Array<{ url: string; steps: EasyApplyStepReport[] }>;
  profile: Awaited<ReturnType<AppDeps["loadCandidateMasterProfile"]>>;
  runType: EasyApplyRunType;
  deps: AppDeps;
}) {
  const payloads = args.results
    .map((result) => ({
      url: result.url,
      payload: buildPreparedSurveyPayload(result.steps),
    }))
    .filter((entry): entry is { url: string; payload: NonNullable<ReturnType<typeof buildPreparedSurveyPayload>> } => entry.payload != null);

  if (payloads.length === 0) {
    return [];
  }

  const snapshot = await createCandidateProfileSnapshotForSurvey({
    profile: args.profile,
    deps: args.deps,
  });

  const preparedAnswerSets = [];
  for (const entry of payloads) {
    const jobPostingId = args.deps.prisma.jobPosting.findUnique
      ? (await args.deps.prisma.jobPosting.findUnique({
          where: { url: entry.url },
          select: { id: true },
        }))?.id ?? null
      : null;
    const preparedAnswerSet = await args.deps.prisma.preparedAnswerSet.create({
      data: {
        ...(jobPostingId ? { jobPostingId } : {}),
        candidateProfileId: snapshot.id,
        questionsJson: JSON.stringify(entry.payload.questions),
        answersJson: JSON.stringify({
          sourceUrl: entry.url,
          runType: args.runType,
          answers: entry.payload.answers,
        }),
      },
    });
    preparedAnswerSets.push(preparedAnswerSet);
  }

  await persistSystemEvent(
    {
      level: "INFO",
      scope: "linkedin.easy_apply",
      message: "Easy Apply survey answers saved.",
      runType: args.runType,
      details: {
        candidateProfileSnapshotId: snapshot.id,
        preparedAnswerSetCount: preparedAnswerSets.length,
      },
    },
    args.deps,
  );

  return preparedAnswerSets;
}
