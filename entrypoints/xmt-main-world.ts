import { installInterceptor } from '../src/core/adapter/intercept'

export default defineUnlistedScript(() => {
  installInterceptor({
    fetch: window.fetch.bind(window),
    XMLHttpRequest: window.XMLHttpRequest,
    postMessage: (message, targetOrigin) =>
      window.postMessage(message, targetOrigin),
  })
})
