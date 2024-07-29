/**
 * game service
 */

import axios from "axios";
import { JSDOM } from "jsdom";
import { factories } from "@strapi/strapi";
import slugify from "slugify";

const gameService = "api::game.game";
const publisherService = "api::publisher.publisher";
const developerService = "api::developer.developer";
const categoryService = "api::category.category";
const platformService = "api::platform.platform";

async function getGameInfo(slug) {
  const gogSlug = slug.replaceAll("-", "_").toLowerCase();
  const body = await axios.get(`https://www.gog.com/en/game/${gogSlug}`);
  const dom = new JSDOM(body.data);
  const rawDescription = dom.window.document.querySelector("div.description");
  const description = rawDescription.innerHTML.trim();
  const shortDescription = rawDescription.textContent.trim().slice(0, 160);

  return {
    description: description,
    short_description: shortDescription,
  };
}

async function getByName(name, entityService) {
  const item = await strapi.service(entityService).find({
    filters: {
      name,
    },
  });

  return item.results.length > 0 ? item.results[0] : null;
}

async function create(name, entityService) {
  const item = await getByName(name, entityService);

  if (!item) {
    await strapi.service(entityService).create({
      data: {
        name,
        slug: slugify(name, { strict: true, lower: true }),
      },
    });
  }
}

async function createManyToManyData(products) {
  const developersSet = new Set();
  const publishersSet = new Set();
  const categoriesSet = new Set();
  const platformsSet = new Set();

  products.forEach((product) => {
    const { developers, publishers, genres, operatingSystems } = product;

    genres?.forEach(({ name }) => {
      categoriesSet.add(name);
    });

    developers?.forEach((item) => {
      developersSet.add(item);
    });

    operatingSystems?.forEach((item) => {
      platformsSet.add(item);
    });

    publishers?.forEach((item) => {
      publishersSet.add(item);
    });
  });

  const createCall = (set, entityName) =>
    Array.from(set).map((name) => create(name, entityName));

  return Promise.all([
    ...createCall(developersSet, developerService),
    ...createCall(publishersSet, publisherService),
    ...createCall(categoriesSet, categoryService),
    ...createCall(platformsSet, platformService),
  ]);
}

async function createGames(products) {
  await Promise.all(
    products.map(async (product) => {
      const item = await getByName(product.title, gameService);

      if (!item) {
        console.log(`Creating game ${product.title}...`);

        const game = await strapi.service(`${gameService}`).create({
          data: {
            name: product.title,
            slug: product.slug,
            price: product.price.finalMoney.amount,
            release_date: new Date(product.releaseDate),
            categories: await Promise.all(
              product.genres.map(({ name }) => getByName(name, categoryService))
            ),
            platforms: await Promise.all(
              product.operatingSystems.map((name) =>
                getByName(name, platformService)
              )
            ),
            developers: await Promise.all(
              product.developers.map((name) =>
                getByName(name, developerService)
              )
            ),
            publisher: await Promise.all(
              product.publishers.map((name) =>
                getByName(name, publisherService)
              )
            ),
            rating: `BR${product.ratings[0].ageRating}`,
            ...(await getGameInfo(product.slug)),
            publishedAt: new Date(),
          },
        });

        return game;
      }
    })
  );
}

export default factories.createCoreService("api::game.game", () => ({
  async populate(params) {
    const gogApiUrl = `https://catalog.gog.com/v1/catalog?limit=48&order=deshttps://catalog.gog.com/v1/catalog?limit=48&order=desc%3Atrending`;

    const {
      data: { products },
    } = await axios.get(gogApiUrl);

    await createManyToManyData([products[0]]);

    await createGames([products[0]]);

    // await getGameInfo(products[0].slug);

    return products;
  },
}));
