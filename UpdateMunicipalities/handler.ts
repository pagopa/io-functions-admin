import { Context } from "@azure/functions";
import { BlobService } from "azure-storage";
import { sequenceT } from "fp-ts/lib/Apply";
import { array, chunksOf } from "fp-ts/lib/Array";
import { isRight } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import { TaskEither, taskEitherSeq } from "fp-ts/lib/TaskEither";
import { fromLeft } from "fp-ts/lib/TaskEither";
import {
  exportAbolishedMunicipality,
  exportCurrentMunicipalities,
  exportForeignMunicipalities,
  getItalianMunicipalitiesCsv
} from "../utils/municipality";

const logPrefix = "getUpdateMunicipalitiesHandler";

/**
 * Returns a function for handling UpdateMunicipalities
 */
export const getUpdateMunicipalitiesHandler = (
  blobService: BlobService
) => async (context: Context): Promise<unknown> => {
  const partialResults = sequenceT(taskEitherSeq)(
    exportAbolishedMunicipality(blobService),
    exportForeignMunicipalities(blobService)
  )
    .mapLeft(err => {
      context.log.error(`${logPrefix}|Cannot update municipalities|${err}`);
      return fromLeft(err);
    })
    .run();

  // tslint:disable-next-line: readonly-array
  const currMunArray = [];

  const maybeMunicipalitiesCsv = await getItalianMunicipalitiesCsv().run();
  if (isRight(maybeMunicipalitiesCsv)) {
    const currentMunicipalities = exportCurrentMunicipalities(
      blobService,
      maybeMunicipalitiesCsv.value
    );

    // tslint:disable-next-line: readonly-array
    const arr: Array<TaskEither<Error, Option<BlobService.BlobResult>>> = [];
    currentMunicipalities.forEach(elem => arr.push(elem));
    const chunks = chunksOf(arr, 100);

    for (const currentMunicipalitesChunk of chunks) {
      currMunArray.push(
        array
          .sequence(taskEitherSeq)(currentMunicipalitesChunk)
          .mapLeft(err => {
            context.log.error(
              `${logPrefix}|Cannot update municipalities|${err}`
            );
            return fromLeft(err);
          })
          .run()
      );
    }
  }

  return Promise.all([partialResults, ...currMunArray]);
};
