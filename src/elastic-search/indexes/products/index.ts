import { prisma } from '#common/db';
import { elasticsearch } from '#common/elastic-search';
import {
  BuildProductDocumentData,
  ProductDocument,
  ProductDocumentBuilder,
} from './base';
import { productToProductDocumentData } from './utils';

const INDEX_NAME = 'products';

export const save = async (
  data: BuildProductDocumentData,
  upsert = true,
): Promise<void> => {
  try {
    const document = new ProductDocumentBuilder().buildDocument(data);
    const response = await elasticsearch.bulk({
      body: [
        {
          [upsert ? 'index' : 'create']: {
            _index: INDEX_NAME,
            _id: document.id,
          },
        },
        document,
      ],
    });

    console.log('elasticsearch-products', JSON.stringify(response));
  } catch (error) {
    console.error(
      'elasticsearch-products',
      JSON.stringify({
        topic: 'save',
        upsert,
        data: {
          product: JSON.stringify(data),
        },
        error,
      }),
    );

    throw error;
  }
};

export const getIndexName = (): string => {
  return INDEX_NAME;
};

export const initIndex = async (): Promise<void> => {
  try {
    if (await elasticsearch.indices.exists({ index: INDEX_NAME })) {
      console.info(
        'elasticsearch-products',
        JSON.stringify({
          topic: 'initIndex',
          message: 'Index already exists.',
          indexName: INDEX_NAME,
        }),
      );
    } else {
      console.info(
        'elasticsearch-products',
        JSON.stringify({
          topic: 'initIndex',
          message: 'Creating Index.',
          indexName: INDEX_NAME,
        }),
      );

      const params = {
        aliases: {
          [INDEX_NAME]: {},
        },
        index: `${INDEX_NAME}-${Date.now()}`,
      };

      const createIndexResponse = await elasticsearch.indices.create(params);

      console.info(
        'elasticsearch-products',
        JSON.stringify({
          topic: 'initIndex',
          message: 'Index Created!',
          indexName: INDEX_NAME,
          params,
          createIndexResponse,
        }),
      );
    }
  } catch (error) {
    console.error(
      'elasticsearch-products',
      JSON.stringify({
        topic: 'initIndex',
        message: 'Error.',
        indexName: INDEX_NAME,
        error,
      }),
    );

    throw error;
  }
};

export const query = async (params: {
  keyword?: string;
  limit?: number;
}): Promise<any> => {
  let esQuery = undefined;

  esQuery = {
    bool: {
      filter: [
        {
          term: { category: params.keyword },
        },
      ],
    },
  };

  const esSearchParams = {
    index: INDEX_NAME,
    query: esQuery,
    size: params.limit,
  };

  const esResult = await elasticsearch.search<ProductDocument>(esSearchParams);
  console.log('elasticsearch-products', JSON.stringify(esResult));

  return { esResult };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _getAllData = async (): Promise<ProductDocument[]> => {
  const esResult = await elasticsearch.search<ProductDocument>({
    index: INDEX_NAME,
  });
  const results = esResult.hits.hits.map((hit) => hit._source!);
  return results;
};

const getDataByProductId = async (
  productId: number,
): Promise<ProductDocument | null> => {
  const query = {
    bool: {
      must: [
        {
          term: { product_id: productId },
        },
      ],
    },
  };
  const esResult = await elasticsearch.search<ProductDocument>({
    index: INDEX_NAME,
    query,
    size: 1,
  });

  const results = esResult.hits.hits.map((hit) => hit._source!);
  if (results.length === 0) {
    return null;
  }
  return results[0];
};

export const syncDataMissing = async (): Promise<void> => {
  try {
    const postgresData = await prisma.product.findMany({
      include: {
        owner: true,
        collections: true,
        attributes: true,
      },
    });

    console.log(
      'syncDataMissing-postgresData: ',
      JSON.stringify(postgresData.length),
    );

    for (const data of postgresData) {
      const elasticData = await getDataByProductId(data.id);
      let upsert = false;
      if (!elasticData) {
        upsert = false;
      } else {
        console.log(
          `syncDataMissing product id: ${JSON.stringify(data.updated_at)} with elasticData: ${elasticData.updated_at}`,
        );
        // check if updated_at is newer
        if (new Date(data.updated_at) > new Date(elasticData.updated_at)) {
          console.log(`New update found for product id: ${data.id}`);
          data.id = elasticData.id;
          upsert = true;
        } else {
          continue;
        }
      }

      const document = productToProductDocumentData(data);
      await save(document, upsert);

      console.log(
        `syncDataMissing product id: ${JSON.stringify(data.id)} with upsert: ${upsert}`,
      );
    }
  } catch (error) {
    console.error(
      'elasticsearch-products',
      JSON.stringify({
        topic: 'syncDataMissing',
        message: 'Error.',
        indexName: INDEX_NAME,
        error,
      }),
    );
  }
};