import { Container } from "@azure/cosmos";
import { mapAsyncIterable } from "io-functions-commons/dist/src/utils/async";
import * as t from "io-ts";

/**
 *  Find all versions of a document.
 *
 *  Pass the partitionKey field / values if it differs from the modelId
 *  to avoid multi-partition queries.
 */
export function findAllVersionsByModelId<TR>(
  container: Container,
  retrievedItemType: t.Type<TR, unknown, unknown>,
  modelIdField: string,
  modelIdValue: string,
  partitionKeyField: string,
  partitionKeyValue: string
): AsyncIterable<ReadonlyArray<t.Validation<TR>>> {
  const iterator = container.items
    .query({
      parameters: [
        {
          name: "@modelId",
          value: modelIdValue
        },
        {
          name: "@partitionKey",
          value: partitionKeyValue
        }
      ],
      // do not use ${collectionName} here as it may contain special characters
      query: `SELECT * FROM m WHERE (m.${modelIdField} = @modelId
          AND m.${partitionKeyField} = @partitionKey)`
    })
    .getAsyncIterator();
  return mapAsyncIterable(iterator, feedResponse =>
    feedResponse.resources.map(retrievedItemType.decode)
  );
}
