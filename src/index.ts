import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT ?? 8787);

app.listen(PORT, () => {
  console.log(`Agent Deal → http://localhost:${PORT}`);
});
