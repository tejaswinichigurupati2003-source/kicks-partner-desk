"use client";

import { useDesk } from "@/lib/desk";
import { Card, Loading, PageHeader } from "@/components/ui";

export default function Stores() {
  const { ready, ws } = useDesk();
  if (!ready) return <Loading />;
  return (
    <>
      <PageHeader title="Our stores" intro={`The ${ws.stores.length} Kicks stores open today. We never open a second store in the same pin code, so these pin codes are taken.`} />
      <Card className="overflow-x-auto">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>City</th>
              <th>Pin code</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {ws.stores.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.id}</td>
                <td>{s.city}</td>
                <td className="mono">{s.pin}</td>
                <td className="mono">{s.year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
