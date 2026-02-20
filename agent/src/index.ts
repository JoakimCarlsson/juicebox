import Java from "frida-java-bridge";

Java.perform(() => {
  send({ type: "ready", payload: { pid: Process.id } });
});

rpc.exports = {
  ping(): string {
    return "pong";
  },
};
