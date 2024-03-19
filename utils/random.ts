/**
 * Utilities for handling random data generation
 */

import * as t from "io-ts";
import * as E from "fp-ts/lib/Either";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { WithinRangeString } from "@pagopa/ts-commons/lib/strings";
import * as randomstring from "randomstring";
import { pipe } from "fp-ts/lib/function";

/* printable 7 bit ASCII, some special char removed */
const RANDOM_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()+-/=?@";

export const StrongPassword = WithinRangeString(18, 19);
export type StrongPassword = t.TypeOf<typeof StrongPassword>;

/**
 * Generates a randomic passwords with a high variety of characters
 */
export const generateStrongPassword = (): StrongPassword =>
  pipe(
    randomstring.generate({
      charset: RANDOM_CHARSET,
      length: 18
    }),
    StrongPassword.decode,
    E.getOrElseW(err => {
      throw new Error(
        `Failed generating strong password - ${readableReport(err)}`
      );
    })
  );
