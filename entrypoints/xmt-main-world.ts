import { installInterceptor } from '../src/core/adapter/intercept'

export default defineUnlistedScript(() => {
  // The real window is the target: the patch has to land on window.fetch itself.
  installInterceptor(window)
})
