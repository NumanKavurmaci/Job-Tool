import { PrismaClient } from "@prisma/client";
import { assertPrismaRuntimeReady } from "./runtimeGuard.js";

assertPrismaRuntimeReady();
export const prisma = new PrismaClient();
