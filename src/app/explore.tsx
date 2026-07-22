import { Redirect } from 'expo-router';

// The default template's second tab is no longer used — SpendLens is camera-first.
export default function ExploreRedirect() {
  return <Redirect href="/" />;
}
