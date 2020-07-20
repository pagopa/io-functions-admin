import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";

export const ABORT_EVENT = "user-data-processing-delete-abort";

export const makeOrchestratorId = (doc: UserDataProcessing): string =>
  `delete-${doc.userDataProcessingId}`;
