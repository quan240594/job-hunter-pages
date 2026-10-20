import { DataState } from '../components/DataState';
import { ProfileEditor } from '../components/ProfileEditor';
import { useProfile } from '../hooks/useData';

export function ProfilePage() {
  const state = useProfile();
  return (
    <section aria-labelledby="profile-heading">
      <h1 id="profile-heading">Profile</h1>
      <p className="muted">Your CV details and search settings. Only you can see them.</p>
      <DataState state={state} loadingLabel="Loading your profile…">
        {(profile) => <ProfileEditor profile={profile} />}
      </DataState>
    </section>
  );
}
