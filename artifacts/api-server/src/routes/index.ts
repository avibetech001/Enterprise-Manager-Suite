import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import companyRouter from "./company";
import permissionsRouter from "./permissions";
import usersRouter from "./users";
import departmentsRouter from "./departments";
import employeesRouter from "./employees";
import notificationsRouter from "./notifications";
import modulesRouter from "./modules";
import storageRouter from "./storage";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(companyRouter);
router.use(permissionsRouter);
router.use(usersRouter);
router.use(departmentsRouter);
router.use(employeesRouter);
router.use(notificationsRouter);
router.use(modulesRouter);
router.use(storageRouter);
router.use(pushRouter);

export default router;
