import { BlobService } from "azure-storage";
import { array } from "fp-ts/lib/Array";
import { left as leftE, right as rightE } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  TaskEither,
  taskEither
} from "fp-ts/lib/TaskEither";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString, PatternString } from "italia-ts-commons/lib/strings";
import { Municipality } from "../generated/definitions/Municipality";
import {
  getCsvFromURL,
  getFileFromBlob,
  parseCsv,
  StringMatrix,
  writeBlobFromJson
} from "./file";

const ITALIAN_MUNICIPALITIES_URL = getRequiredStringEnv(
  "ITALIAN_MUNICIPALITIES_URL"
);

const MUNICIPALITIES_CONTAINER_NAME = getRequiredStringEnv(
  "MUNICIPALITIES_CONTAINER_NAME"
);
const ABOLISHED_MUNICIPALITIES_BLOB_NAME = getRequiredStringEnv(
  "ABOLISHED_MUNICIPALITIES_BLOB_NAME"
);
const MUNICIPALITIES_CATASTALI_BLOB_NAME = getRequiredStringEnv(
  "MUNICIPALITIES_CATASTALI_BLOB_NAME"
);
const FOREIGN_COUNTRIES_BLOB_NAME = getRequiredStringEnv(
  "FOREIGN_COUNTRIES_BLOB_NAME"
);

/**
 * This type represent the data of :ABOLISHED_MUNICIPALITIES_FILEPATH:
 */
export const AbolishedMunicipality = t.type({
  comune: t.string,
  istat: t.string,
  provincia: t.string
});

export const AbolishedMunicipalityArray = t.readonlyArray(
  AbolishedMunicipality
);

export type AbolishedMunicipalityArray = t.TypeOf<
  typeof AbolishedMunicipalityArray
>;

export type AbolishedMunicipality = t.TypeOf<typeof AbolishedMunicipality>;

const optionMunicipalitiesWithCatastale = {
  delimiter: ",",
  from_line: 1,
  skip_empty_lines: true,
  skip_lines_with_error: true,
  trim: true
};

const optionCsvParseForeignCountries = {
  delimiter: ";",
  from_line: 3, // skip header + italy entry
  skip_empty_lines: false,
  skip_lines_with_error: false,
  trim: true
};

const currentMiunicipalitiesParserOption = {
  delimiter: ";",
  from_line: 4,
  skip_empty_lines: true,
  skip_lines_with_error: true,
  trim: true
};

export interface ISerializableMunicipality {
  codiceCatastale: string;
  municipality: Municipality;
}

// try to decode municipality csv row in a Municipality object
export const decodeMunicipality = (
  record: ReadonlyArray<string>
): t.Validation<Municipality> => {
  if (record.length < 13) {
    return leftE([
      {
        context: [],
        value: "record has not the right length"
      }
    ]);
  }
  const municipality = {
    codiceProvincia: record[3],
    codiceRegione: record[0],
    denominazione: record[5],
    denominazioneInItaliano: record[6],
    denominazioneRegione: record[10],
    siglaProvincia: record[14]
  };
  return Municipality.decode(municipality);
};

// try to decode foreign country csv row in a Municipality object
export const decodeForeignCountry = (
  record: ReadonlyArray<string>
): t.Validation<Municipality> => {
  if (record.length < 15) {
    return leftE([
      {
        context: [],
        value: "record has not the right length"
      }
    ]);
  }
  const municipality = {
    codiceProvincia: "",
    codiceRegione: "",
    denominazione: record[7],
    denominazioneInItaliano: record[6],
    denominazioneRegione: record[4],
    siglaProvincia: ""
  };
  return Municipality.decode(municipality);
};

/**
 * A string that represents a municipality codice catastale
 * https://it.wikipedia.org/wiki/Codice_catastale
 */

const CODICE_CATASTALE_REGEX = `^[A-Z]\\d{3}$`;

export const CodiceCatastale = PatternString(CODICE_CATASTALE_REGEX);
export type CodiceCatastale = t.TypeOf<typeof CodiceCatastale>;

/**
 * load all the codici catastali and create a mapping between the name of the municipality and the codice catastale
 */
const loadMunicipalityToCatastale = (
  blobService: BlobService
): TaskEither<Error, Map<string, string>> =>
  getFileFromBlob(
    blobService,
    MUNICIPALITIES_CONTAINER_NAME,
    MUNICIPALITIES_CATASTALI_BLOB_NAME
  )
    .foldTaskEither<Error, StringMatrix>(
      err => fromLeft(err),
      _ =>
        _.foldL(
          () => fromLeft(new Error("Municipalities with catastale is empty")),
          __ =>
            parseCsv(__, optionMunicipalitiesWithCatastale).foldTaskEither(
              e => fromEither(leftE(e)),
              matrixString => fromEither(rightE(matrixString))
            )
        )
    )
    .foldTaskEither<Error, Map<string, string>>(
      err => fromLeft(err),
      municipalitiesCatastaleRows =>
        fromEither(
          rightE(
            municipalitiesCatastaleRows.reduce(
              (map: Map<string, string>, row) => {
                map.set(row[1].toLowerCase(), row[0]);
                return map;
              },
              new Map<string, string>()
            )
          )
        )
    );

const fromAbolishedMunicipalityToSerializableMunicipality = (
  abolishedMunicipality: t.TypeOf<typeof AbolishedMunicipality>,
  codiceCatastale: string
) => {
  return {
    codiceCatastale,
    municipality: {
      codiceProvincia: "",
      codiceRegione: "",
      denominazione: abolishedMunicipality.comune,
      denominazioneInItaliano: abolishedMunicipality.comune,
      denominazioneRegione: "",
      siglaProvincia: abolishedMunicipality.provincia
    }
  } as ISerializableMunicipality;
};

/**
 * load the abolished municipality and filter the municipality without catastal code
 * @param blobService: used to to connect to blobStorage
 * @param municipalityToCatastale: used to filter and remove the municipality without catastal code
 */
const loadAbolishedMunicipalities = (
  blobService: BlobService,
  municipalityToCatastale: Map<string, string>
): TaskEither<Error, ReadonlyArray<ISerializableMunicipality>> =>
  getFileFromBlob(
    blobService,
    MUNICIPALITIES_CONTAINER_NAME,
    ABOLISHED_MUNICIPALITIES_BLOB_NAME
  )
    .chain(rawFile =>
      rawFile.foldL(
        () => fromEither(leftE(new Error("abolished municipalities is empty"))),
        json => fromEither(rightE(JSON.parse(json)))
      )
    )
    .chain(abolishedMunArray =>
      fromEither(
        rightE(
          abolishedMunArray
            .filter(am => municipalityToCatastale.has(am.comune.toLowerCase()))
            .map(am =>
              fromAbolishedMunicipalityToSerializableMunicipality(
                am,
                municipalityToCatastale.get(am.comune.toLowerCase())
              )
            )
        )
      )
    );

const calculateMunicipalityPath = (codiceCatastale: string) =>
  `${MUNICIPALITIES_CONTAINER_NAME}/${codiceCatastale.charAt(
    0
  )}/${codiceCatastale.charAt(1)}` as NonEmptyString;

export const serializeMunicipalityToJson = (
  blobService: BlobService,
  serializableMunicipality: ISerializableMunicipality
): TaskEither<Error, Option<BlobService.BlobResult>> =>
  CodiceCatastale.decode(serializableMunicipality.codiceCatastale).fold(
    errs =>
      fromLeft(
        new Error(`Cannot decode CodiceCatastale| ${readableReport(errs)}`)
      ),
    codiceCatastaleValue =>
      writeBlobFromJson(
        blobService,
        calculateMunicipalityPath(codiceCatastaleValue),
        `${codiceCatastaleValue}.json` as NonEmptyString,
        JSON.stringify(serializableMunicipality.municipality) as NonEmptyString
      )
  );

export const exportAbolishedMunicipality = (
  blobService: BlobService
): TaskEither<Error, ReadonlyArray<Option<BlobService.BlobResult>>> =>
  loadMunicipalityToCatastale(blobService)
    .chain(municipalityToCatastale =>
      loadAbolishedMunicipalities(blobService, municipalityToCatastale)
    )
    .chain(abolishedMunicipalities =>
      array.sequence(taskEither)(
        abolishedMunicipalities.map(municipality =>
          serializeMunicipalityToJson(blobService, municipality)
        )
      )
    );

export const exportCurrentMunicipalities = (
  blobService: BlobService
): TaskEither<Error, ReadonlyArray<Option<BlobService.BlobResult>>> =>
  getCsvFromURL(ITALIAN_MUNICIPALITIES_URL, {
    encoding: "latin1"
    // tslint:disable-next-line: no-any
  } as any)
    .chain(csvContent =>
      parseCsv(csvContent, currentMiunicipalitiesParserOption)
    )
    .chain(result =>
      array.sequence(taskEither)(
        result.map(r =>
          decodeMunicipality(r).fold(
            e =>
              fromLeft(
                new Error(`Cannot decode current municipality| ${e.toString()}`)
              ),
            municipality =>
              serializeMunicipalityToJson(blobService, {
                codiceCatastale: r[19],
                municipality
              })
          )
        )
      )
    );

export const exportForeignMunicipalities = (
  blobService: BlobService
): TaskEither<Error, ReadonlyArray<Option<BlobService.BlobResult>>> =>
  getFileFromBlob(
    blobService,
    MUNICIPALITIES_CONTAINER_NAME,
    FOREIGN_COUNTRIES_BLOB_NAME
  )
    .chain(maybeCsv =>
      maybeCsv.foldL(
        () =>
          fromLeft<Error, StringMatrix>(
            new Error("Elenco codici e denominazioni is empty")
          ),
        csv => parseCsv(csv, optionCsvParseForeignCountries)
      )
    )
    .chain(result =>
      array.sequence(taskEither)(
        result
          .filter(r => r[9] !== "")
          .map(r =>
            decodeForeignCountry(r).fold(
              e =>
                fromLeft(
                  new Error(
                    `Cannot decode foreign municipality| ${e.toString()}`
                  )
                ),
              municipality =>
                serializeMunicipalityToJson(blobService, {
                  codiceCatastale: r[9],
                  municipality
                })
            )
          )
      )
    );
