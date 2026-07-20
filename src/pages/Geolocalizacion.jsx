import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { authInvoke } from '@/lib/authInvoke';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapPin, RefreshCw, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import useEmployeeProfile from '@/hooks/useEmployeeProfile';
import moment from 'moment';
import L from 'leaflet';

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function Geolocalizacion() {
  const { employee } = useEmployeeProfile();
  const empId = employee?.id;
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onBreak, setOnBreak] = useState(false);

  async function load() {
    if (!empId) return;
    setLoading(true);
    try {
      const [locRes, employees] = await Promise.all([
        authInvoke('trackTime', { operation: 'listActiveLocations',  }),
        base44.entities.Employee.filter({ role: 'jefe' })
      ]);
      const data = locRes.data?.locations || [];
      const jefeIds = employees.map(e => e.id);
      setOnBreak(!!locRes.data?.onBreak);
      setLocations(data.filter(loc => !jefeIds.includes(loc.employee_id)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [empId]);

  const center = locations.length > 0
    ? [locations[0].latitude, locations[0].longitude]
    : [42.5063, 1.5218]; // Andorra

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Geolocalización"
        subtitle="Última ubicación registrada al fichar entrada/salida"
        actions={
          <Button variant="outline" onClick={load} className="gap-2 border-border">
            <RefreshCw size={18} /> Actualizar
          </Button>
        }
      />

      <div className="bg-card rounded-xl border border-border overflow-hidden mb-6 relative z-0 h-[320px] sm:h-[420px] lg:h-[500px]">
        {!loading && onBreak && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Coffee size={22} className="text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">En descanso (12:30 - 13:00)</p>
              <p className="text-sm text-muted-foreground mt-1">La geolocalización no está disponible durante este tramo.</p>
            </div>
          </div>
        )}
        {!loading && !onBreak && (
          <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {locations.map(loc => (
              <Marker key={loc.id} position={[loc.latitude, loc.longitude]}>
                <Popup>
                  <div className="text-sm">
                    <strong>{loc.employee_name}</strong><br />
                    Última actualización: {moment(loc.last_update).format('HH:mm:ss')}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {onBreak && !loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Los empleados están en su descanso — sus posiciones volverán a mostrarse a partir de las 13:00.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map(loc => (
            <div key={loc.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center">
                <MapPin size={18} className="text-success" />
              </div>
              <div>
                <p className="font-medium text-sm">{loc.employee_name}</p>
                <p className="text-xs text-muted-foreground">
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)} · {moment(loc.last_update).fromNow()}
                </p>
              </div>
            </div>
          ))}
          {locations.length === 0 && !loading && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              No hay empleados con ubicación activa
            </div>
          )}
        </div>
      )}
    </div>
  );
}