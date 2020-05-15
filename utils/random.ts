/**
 * Utilities for handling random data generation
 */

import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString, PatternString } from "italia-ts-commons/lib/strings";
import * as randomstring from "randomstring";

const UPPERCASED_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWYZ";
const LOWERCASE_LETTERS = "abcdefghijklmnopqrstuvwyz";
const NUMBERS = "0123456789";
const SYMBOLS = "!£$%&()?+@=€";

// at least 10 characters, at least one symbol one uppercase, one lowercase, one number
const STRONG_PASSWORD_PATTERN =
  "(?=.{10,})(?=.*[!£$%&()?+@=€].*)(?=.*[a-z].*)(?=.*[A-Z].*)(?=.*[0-9].*)";

export const StrongPassword = t.intersection([
  PatternString(STRONG_PASSWORD_PATTERN),
  NonEmptyString
]);
export type StrongPassword = t.TypeOf<typeof StrongPassword>;

const shuffleString = (str: string): string => {
  const a = str.split("");
  // tslint:disable-next-line: no-let
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.join("");
};

/**
 * Generates a randomic passwords with a high variety of characters
 */
export const generateStrongPassword = (): StrongPassword =>
  StrongPassword.decode(
    shuffleString(
      // tslint:disable-next-line: restrict-plus-operands
      randomstring.generate({
        charset: UPPERCASED_LETTERS,
        length: 5
      }) +
        randomstring.generate({
          charset: LOWERCASE_LETTERS,
          length: 5
        }) +
        randomstring.generate({
          charset: NUMBERS,
          length: 5
        }) +
        randomstring.generate({
          charset: SYMBOLS,
          length: 3
        })
    )
  ).getOrElseL(err => {
    throw new Error(
      `Failed generating strong password - ${readableReport(err)}`
    );
  });
