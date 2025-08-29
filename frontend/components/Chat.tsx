// ...imports stay the same...
// inside the file, replace: `} catch (_err) {` with:
} catch {
  setMessages((m) => [
    ...m,
    { role: "assistant", type: "text", content: "Error processing your request." },
  ]);
} finally {
// ...
