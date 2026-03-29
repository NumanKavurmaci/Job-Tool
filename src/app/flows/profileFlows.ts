import { readFile } from "node:fs/promises";
import { AppError, serializeError } from "../../utils/errors.js";
import type { InputQuestion } from "../../questions/types.js";
import type { CliArgs } from "../cli.js";
import type { AppDeps } from "../deps.js";
import { loadMasterProfileForArgs } from "../flowHelpers.js";
import { persistRunArtifact, persistSystemEvent } from "../observability.js";

export async function runBuildProfileFlow(
  args: Extract<CliArgs, { mode: "build-profile" }>,
  deps: AppDeps,
) {
  const profile = await loadMasterProfileForArgs(args, deps);
  let snapshot;

  try {
    snapshot = await deps.prisma.candidateProfileSnapshot.create({
      data: {
        fullName: profile.fullName,
        linkedinUrl: profile.linkedinUrl,
        resumePath: profile.sourceMetadata.resumePath ?? null,
        profileJson: JSON.stringify(profile),
      },
    });
  } catch (error) {
    await persistSystemEvent(
      {
        level: "ERROR",
        scope: "database.candidate_profile",
        message: "Failed to save candidate profile snapshot.",
        runType: args.mode,
        details: { error: serializeError(error) },
      },
      deps,
    );
    throw new AppError({
      message: "Failed to save candidate profile snapshot to the database.",
      phase: "database",
      code: "DATABASE_CANDIDATE_SNAPSHOT_FAILED",
      cause: error,
    });
  }

  deps.logger.info(
    {
      candidateProfileSnapshotId: snapshot.id,
      fullName: profile.fullName,
      linkedinUrl: profile.linkedinUrl,
    },
    "Candidate profile snapshot saved",
  );
  await persistSystemEvent(
    {
      level: "INFO",
      scope: "candidate.profile",
      message: "Candidate profile snapshot saved.",
      runType: args.mode,
      details: {
        candidateProfileSnapshotId: snapshot.id,
        linkedinUrl: profile.linkedinUrl,
      },
    },
    deps,
  );

  const result = { mode: args.mode, profile, snapshot };
  const reportPath = await persistRunArtifact({
    category: "profile-runs",
    prefix: args.mode,
    payload: result,
    deps,
  });

  return { ...result, reportPath };
}

export async function runAnswerQuestionsFlow(
  args: Extract<CliArgs, { mode: "answer-questions" }>,
  deps: AppDeps,
) {
  const profile = await loadMasterProfileForArgs(args, deps);
  let snapshot;
  let preparedAnswerSet;

  try {
    snapshot = await deps.prisma.candidateProfileSnapshot.create({
      data: {
        fullName: profile.fullName,
        linkedinUrl: profile.linkedinUrl,
        resumePath: profile.sourceMetadata.resumePath ?? null,
        profileJson: JSON.stringify(profile),
      },
    });
  } catch (error) {
    await persistSystemEvent(
      {
        level: "ERROR",
        scope: "database.candidate_profile",
        message: "Failed to save candidate profile snapshot.",
        runType: args.mode,
        details: { error: serializeError(error) },
      },
      deps,
    );
    throw new AppError({
      message: "Failed to save candidate profile snapshot to the database.",
      phase: "database",
      code: "DATABASE_CANDIDATE_SNAPSHOT_FAILED",
      cause: error,
    });
  }

  const questions = JSON.parse(
    await readFile(args.questionsPath, "utf8"),
  ) as InputQuestion[];
  const answers = await Promise.all(
    questions.map(async (question) => ({
      question,
      resolved: await deps.resolveAnswer({
        question,
        candidateProfile: profile,
      }),
    })),
  );

  try {
    preparedAnswerSet = await deps.prisma.preparedAnswerSet.create({
      data: {
        candidateProfileId: snapshot.id,
        questionsJson: JSON.stringify(questions),
        answersJson: JSON.stringify(answers),
      },
    });
  } catch (error) {
    await persistSystemEvent(
      {
        level: "ERROR",
        scope: "database.prepared_answers",
        message: "Failed to save prepared answers to the database.",
        runType: args.mode,
        details: { error: serializeError(error) },
      },
      deps,
    );
    throw new AppError({
      message: "Failed to save prepared answers to the database.",
      phase: "database",
      code: "DATABASE_PREPARED_ANSWERS_FAILED",
      cause: error,
    });
  }

  deps.logger.info(
    {
      preparedAnswerSetId: preparedAnswerSet.id,
      answerCount: answers.length,
    },
    "Prepared answer set saved",
  );
  await persistSystemEvent(
    {
      level: "INFO",
      scope: "candidate.answers",
      message: "Prepared answer set saved.",
      runType: args.mode,
      details: {
        preparedAnswerSetId: preparedAnswerSet.id,
        answerCount: answers.length,
      },
    },
    deps,
  );

  const result = { mode: args.mode, profile, snapshot, answers, preparedAnswerSet };
  const reportPath = await persistRunArtifact({
    category: "answer-runs",
    prefix: args.mode,
    payload: result,
    deps,
  });

  return { ...result, reportPath };
}
