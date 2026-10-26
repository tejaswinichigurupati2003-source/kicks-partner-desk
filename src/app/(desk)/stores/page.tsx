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
          <caption className="sr-only">Our Kicks stores and their pin codes</caption>
          <thead>
            <tr>
              <th scope="col">Store</th>
              <th scope="col">City</th>
              <th scope="col">Pin code</th>
              <th scope="col">Opened</th>
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
