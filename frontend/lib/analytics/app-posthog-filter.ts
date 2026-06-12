/** HogQL predicate: PostHog events from the ManaTap mobile app only (excludes website chat_/hero_ leaks). */
export const POSTHOG_STRICT_APP_EVENT_FILTER = `
  (
    properties.$lib = 'posthog-react-native'
    OR properties.platform = 'app'
    OR properties.app_surface = 'mobile_app'
    OR properties.source = 'manatap_app'
  )
`;
