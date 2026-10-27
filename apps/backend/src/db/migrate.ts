import { openDatabase } from "./index";

// Opening applies only application-owned migrations; Coco migrates its own file.
const database = openDatabase();
try { console.log("Database migrations applied."); }
finally { database.close(); }
