import * as TE from "fp-ts/TaskEither";

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

export const getAllUserAuthenticationLockDataMock = jest.fn(() =>
  TE.of<Error, ReadonlyArray<AuthenticationLockData>>([])
);

export const deleteUserAuthenticationMock = jest.fn(() =>
  TE.of<Error, true>(true as const)
);

export const AuthenticationLockServiceMock: AuthenticationLockService = ({
  getAllUserAuthenticationLockData: getAllUserAuthenticationLockDataMock,
  deleteUserAuthenticationLockData: deleteUserAuthenticationMock
} as any) as AuthenticationLockService;

// --------------------------------
// \ AuthenticationLockService Mock
// --------------------------------
