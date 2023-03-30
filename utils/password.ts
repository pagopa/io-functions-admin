import { WithinRangeString } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";

export const StrongPassword = WithinRangeString(18, 19);
export type StrongPassword = t.TypeOf<typeof StrongPassword>;
