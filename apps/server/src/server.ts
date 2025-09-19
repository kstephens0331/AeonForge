import Fastify from "fastify";
import cors from "@fastify/cors";
import { verifySupabaseJwt } from "./auth";

const fastify = Fastify({ logger: true });

fastify.register(cors, {
  origin: "http://localhost:3000",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"]
});

fastify.get("/healthz", async () => ({ ok: true }));

// Auth preHandler (optional for healthz)
fastify.addHook("preHandler", async (req, reply) => {
  if (req.routerPath === "/healthz") return;
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "Missing bearer token" });
    return;
  }
  const token = auth.slice("Bearer ".length);
  try {
    const payload = await verifySupabaseJwt(token);
    (req as any).user = payload; // attach for routes
  } catch {
    reply.code(401).send({ error: "Invalid token" });
  }
});

// Echo chat (now requires Auth)
fastify.post<{ Body: { messages: { role: "user" | "assistant" | "system"; content: string }[] } }>(
  "/chat",
  async (request) => {
    const lastUserMsg = [...request.body.messages].reverse().find(m => m.role === "user");
    const text = lastUserMsg?.content ?? "Hello from AeonForge.";
    return { text: `Echo: ${text}` };
  }
);

const PORT = Number(process.env.PORT ?? 8787);
fastify.listen({ port: PORT, host: "0.0.0.0" })
  .then(() => console.log(`API listening on http://localhost:${PORT}`))
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
