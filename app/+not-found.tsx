import { Redirect } from 'expo-router';

export default function NotFoundRedirect() {
  return <Redirect href='/(tabs)/routes' />;
}