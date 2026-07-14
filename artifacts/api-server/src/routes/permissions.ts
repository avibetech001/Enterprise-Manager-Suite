import { Router, type IRouter } from "express";
import { ListPermissionsResponse } from "@workspace/api-zod";
import { PERMISSION_CATALOG, requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/permissions", requireAuth, (_req, res): void => {
  res.json(ListPermissionsResponse.parse(PERMISSION_CATALOG));
});

export default router;
