import { adminRouter } from "./admin-router";
import { studentRouter } from "./student-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  admin: adminRouter,
  student: studentRouter,
});

export type AppRouter = typeof appRouter;
