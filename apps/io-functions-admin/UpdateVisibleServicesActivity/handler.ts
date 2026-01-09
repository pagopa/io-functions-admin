import { Context } from "@azure/functions";
import { VisibleService } from "@pagopa/io-functions-commons/dist/src/models/visible_service";
import * as t from "io-ts";

const AddVisibleServiceInput = t.interface({
  action: t.literal("UPSERT"),
  visibleService: VisibleService
});

const RemoveVisibleServiceInput = t.interface({
  action: t.literal("DELETE"),
  visibleService: VisibleService
});

export const Input = t.taggedUnion("action", [
  AddVisibleServiceInput,
  RemoveVisibleServiceInput
]);

export type Input = t.TypeOf<typeof Input>;

const ResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});

const ResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});

export const Result = t.taggedUnion("kind", [ResultSuccess, ResultFailure]);

export type Result = t.TypeOf<typeof Result>;

/**
 * Temporary Activity Handler to skip all pending UpsertServiceOrchestrator
 * executions.
 */
export const getUpdateVisibleServicesActivityHandler =
  () =>
  async (_: Context, __: unknown): Promise<unknown> =>
    Result.encode({
      kind: "SUCCESS"
    });
