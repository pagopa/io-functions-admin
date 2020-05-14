/**
 * Utilities for handling random data generation
 */

import * as t from "io-ts";
import { NonEmptyString, PatternString } from "italia-ts-commons/lib/strings";

const UPPERCASED_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWYZ".split("");
const LOWERCASE_LETTERS = "abcdefghijklmnopqrstuvwyz".split("");
const NUMBERS = "0123456789".split("");
const SYMBOLS = "!£$%&()?+@=€".split("");

// at least 10 characters, at least one symbol one uppercase, one lowercase, one number
const STRONG_PASSWORD_PATTERN =
  "(?=.{10,})(?=.*[!£$%&()?+@=€].*)(?=.*[a-z].*)(?=.*[A-Z].*)(?=.*[0-9].*)";

export const StrongPassword = t.intersection([
  PatternString(STRONG_PASSWORD_PATTERN),
  NonEmptyString
]);
export type StrongPassword = t.TypeOf<typeof StrongPassword>;

const shuffle = <T>(arr: ReadonlyArray<T>) => {
  const a = Array.from(arr);
  // tslint:disable-next-line: no-let
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Given an array, returns a random element of it
 * @param arr an array
 *
 * @return a random element of the array
 */
export const randomElement = <T>(arr: ReadonlyArray<T>): T =>
  arr[Math.floor(Math.random() * (arr.length - 1))];

/**
 * Generates a randomic passwords with a high variety of characters
 */
export const generateStrongPassword = (): StrongPassword =>
  shuffle([
    ...Array.from({ length: 5 }).map(_ => randomElement(UPPERCASED_LETTERS)),
    ...Array.from({ length: 5 }).map(_ => randomElement(LOWERCASE_LETTERS)),
    ...Array.from({ length: 5 }).map(_ => randomElement(NUMBERS)),
    ...Array.from({ length: 3 }).map(_ => randomElement(SYMBOLS))
  ]).join("") as StrongPassword;
