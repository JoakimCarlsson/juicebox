import { createFileRoute } from "@tanstack/react-router"
import { motion } from "framer-motion"

export const Route = createFileRoute("/")({
  component: IndexPage,
})

function IndexPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-4"
      >
        <h1 className="text-4xl font-bold tracking-tight text-foreground lg:text-5xl">
          Juicebox
        </h1>
        <p className="max-w-md text-center text-lg text-muted-foreground">
          Runtime Android app instrumentation toolkit
        </p>
      </motion.div>
    </div>
  )
}
