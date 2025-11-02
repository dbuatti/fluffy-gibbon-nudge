import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Settings: React.FC = () => {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Future settings for profile management, notifications, and API keys will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;