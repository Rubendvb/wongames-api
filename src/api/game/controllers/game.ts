/**
 * game controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::game.game",
  ({ strapi }) => ({
    async populate(ctx) {
      // const data = await strapi.services.game.populate();
      await strapi.service("api::game.game").populate(ctx.query);

      ctx.send("Finalizando no client");
    },
  })
);
