/**
 * game service
 */

import axios, { formToJSON } from "axios";
import { JSDOM } from "jsdom";
import { factories } from "@strapi/strapi";
import slugify from "slugify";
import qs from "qs";

const gameService = "api::game.game";
const publisherService = "api::publisher.publisher";
const developerService = "api::developer.developer";
const categoryService = "api::category.category";
const platformService = "api::platform.platform";

function Exception(e) {
  return { e, data: e.data && e.data.errors && e.data.errors };
}

async function getGameInfo(slug) {
  try {
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
  } catch (error) {
    console.error("getGameInfo:", Exception(error));
  }
}

async function getByName(name, entityService) {
  try {
    const item = await strapi.service(entityService).find({
      filters: {
        name,
      },
    });

    return item.results.length > 0 ? item.results[0] : null;
  } catch (error) {
    console.error("getByName:", Exception(error));
  }
}

async function create(name, entityService) {
  try {
    const item = await getByName(name, entityService);

    if (!item) {
      await strapi.service(entityService).create({
        data: {
          name,
          slug: slugify(name, { strict: true, lower: true }),
        },
      });
    }
  } catch (error) {
    console.error("create:", Exception(error));
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

async function setImage({ image, game, field = "cover" }) {
  try {
    const { data } = await axios.get(image, { responseType: "arraybuffer" });
    const buffer = Buffer.from(data, "base64");
    const FormData = require("form-data");
    const formData: any = new FormData();

    formData.append("refId", game.id);
    formData.append("ref", `${gameService}`);
    formData.append("field", field);
    formData.append("files", buffer, {
      filename: `${game.slug}.jpg`,
    });

    console.log(`Uploading ${field} image: ${game.slug}.jpg`);

    await axios({
      method: "POST",
      url: `http://localhost:1337/api/upload/`,
      data: formData,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
      },
    });
  } catch (error) {
    console.error("setImage:", Exception(error));
  }
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
            price: product?.price?.finalMoney?.amount || 0,
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
            rating: product?.ratings[0]?.ageRating
              ? `BR${product?.ratings[0]?.ageRating}`
              : "BR0",
            ...(await getGameInfo(product.slug)),
            publishedAt: new Date(),
          },
        });

        await setImage({ image: product.coverHorizontal, game });
        await Promise.all(
          product.screenshots.slice(0, 5).map((url) =>
            setImage({
              image: `${url.replace(
                "{formatter}",
                "product_card_v2_mobile_slider_639"
              )}`,
              game,
              field: "gallery",
            })
          )
        );

        return game;
      }
    })
  );
}

export default factories.createCoreService("api::game.game", () => ({
  async populate(params) {
    try {
      const gogApiUrl = `https://catalog.gog.com/v1/catalog?${qs.stringify(
        params
      )}`;

      const {
        data: { products },
      } = await axios.get(gogApiUrl);

      await createManyToManyData([products[2]]);

      await createGames([products[2]]);

      // await getGameInfo(products[0].slug);

      return products;
    } catch (error) {
      console.error("populate", Exception(error));
    }
  },
}));
