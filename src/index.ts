import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { warmGoogleJwksCache } from "./utils/google.js";

const env = loadEnv();
const app = createApp(env);

void warmGoogleJwksCache();

app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});
