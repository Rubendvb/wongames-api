/**
 * game controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::game.game",
  ({ strapi }) => ({
    async populate(ctx) {
      // const data = await strapi.services.game.populate();
      console.log("Rodando no servidor");

      ctx.send("Finalizando no client");
    },
  })
);
