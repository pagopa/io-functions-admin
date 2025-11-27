import * as TE from "fp-ts/lib/TaskEither";
import { vi } from "vitest";

import AuthenticationLockService, {
  AuthenticationLockData
} from "../DeleteUserDataActivity/authenticationLockService";

// --------------------------------
// AuthenticationLockService Data
// --------------------------------

export { aNotReleasedData, anUnlockCode } from "./lockedProfileTableClient";

// --------------------------------
// AuthenticationLockService Mock
// --------------------------------

export const getAllUserAuthenticationLockDataMock = vi.fn(() =>
  TE.of<Error, readonly AuthenticationLockData[]>([])
);

export const deleteUserAuthenticationMock = vi.fn(() =>
  TE.of<Error, true>(true as const)
);

export const AuthenticationLockServiceMock: AuthenticationLockService = {
  deleteUserAuthenticationLockData: deleteUserAuthenticationMock,
  getAllUserAuthenticationLockData: getAllUserAuthenticationLockDataMock
} as unknown as AuthenticationLockService;

// --------------------------------
// \ AuthenticationLockService Mock
// --------------------------------
