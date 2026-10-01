import { PrismaClient, type Driver, type Truck, type Trailer, type Customer } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CITIES } from "../src/lib/constants";
import { roadKm, pointOnRoute } from "../src/lib/geo";

const db = new PrismaClient();

// Deterministic PRNG so the demo looks the same every reseed.
let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const DAY = 86_400_000;
const now = Date.now();
const city = (n: string) => CITIES.find((c) => c.name === n)!;

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234";

async function main() {
  // The seed WIPES all data. Local dev shares the Neon database with production unless
  // you create a separate branch, so require an explicit opt-in.
  if (process.env.CONFIRM_SEED !== "yes") {
    console.error("Refusing to seed: this deletes ALL data in " + (process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "the database") + ". Re-run with CONFIRM_SEED=yes if you really mean it.");
    process.exit(1);
  }
  console.log("Resetting database…");
  await db.document.deleteMany();
  await db.appSetting.deleteMany();
  await db.auditLog.deleteMany();
  await db.invoice.deleteMany();
  await db.loadEvent.deleteMany();
  await db.load.deleteMany();
  await db.fuelLog.deleteMany();
  await db.maintenanceRecord.deleteMany();
  await db.truck.deleteMany();
  await db.trailer.deleteMany();
  await db.driver.deleteMany();
  await db.customer.deleteMany();
  await db.user.deleteMany();

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---------- Staff ----------
  const staff = [
    { name: "Kamron Rakhimov", email: "owner@demo.local", role: "OWNER" },
    { name: "Aziza Karimova", email: "admin@demo.local", role: "ADMIN" },
    { name: "Bekzod Rashidov", email: "dispatch@demo.local", role: "DISPATCHER" },
    { name: "Malika Yusupova", email: "dispatch2@demo.local", role: "DISPATCHER" },
    { name: "Timur Aliev", email: "fleet@demo.local", role: "FLEET_MANAGER" },
    { name: "Dilnoza Ergasheva", email: "accounting@demo.local", role: "ACCOUNTANT" },
  ];
  const users = [];
  for (const u of staff) users.push(await db.user.create({ data: { ...u, passwordHash: hash, phone: `+998 90 ${int(100, 999)} ${int(10, 99)} ${int(10, 99)}` } }));
  const dispatchers = users.filter((u) => u.role === "DISPATCHER");

  // ---------- Drivers (each with a login) ----------
  const driverNames = [
    "Rustam Nazarov", "Sherzod Tursunov", "Jasur Abdullaev", "Otabek Mirzaev", "Farrukh Kholmatov",
    "Ulugbek Saidov", "Akmal Rakhimov", "Sardor Umarov", "Nodir Ismoilov", "Bobur Kadyrov",
    "Anvar Sultanov", "Dilshod Hamidov", "Eldor Qosimov", "Javlon Normatov",
  ];
  const drivers: Driver[] = [];
  for (const [i, name] of driverNames.entries()) {
    const email = i === 0 ? "driver@demo.local" : `${name.split(" ")[0].toLowerCase()}@demo.local`;
    const user = await db.user.create({ data: { name, email, passwordHash: hash, role: "DRIVER" } });
    drivers.push(
      await db.driver.create({
        data: {
          name, email, userId: user.id,
          phone: `+998 9${int(0, 9)} ${int(100, 999)} ${int(10, 99)} ${int(10, 99)}`,
          licenseNumber: `AF${int(1000000, 9999999)}`,
          licenseClass: "CE",
          // a couple expiring soon so alerts show up
          licenseExpiry: new Date(now + (i === 3 ? 12 : i === 7 ? -5 : int(120, 1400)) * DAY),
          medicalExpiry: new Date(now + (i === 5 ? 20 : int(60, 700)) * DAY),
          hireDate: new Date(now - int(90, 2400) * DAY),
          payPerKm: Math.round(between(0.3, 0.45) * 100) / 100,
          rating: Math.round(between(4.1, 5) * 10) / 10,
          status: i >= 12 ? (i === 12 ? "ON_LEAVE" : "OFF_DUTY") : "AVAILABLE",
        },
      }),
    );
  }

  // ---------- Fleet ----------
  const models = [
    ["Volvo", "FH 500"], ["Scania", "R 450"], ["MAN", "TGX 18.510"], ["Mercedes-Benz", "Actros 1845"],
    ["DAF", "XF 480"], ["Shacman", "X6000"], ["KAMAZ", "54901"], ["Howo", "TX 440"],
  ] as const;
  const trucks: Truck[] = [];
  for (let i = 0; i < 14; i++) {
    const [make, model] = models[i % models.length];
    const home = city(pick(["Tashkent", "Tashkent", "Tashkent", "Samarkand", "Fergana"]));
    const odo = int(40_000, 780_000);
    trucks.push(
      await db.truck.create({
        data: {
          unitNumber: `T-${String(101 + i)}`,
          make, model, year: int(2015, 2025),
          vin: `YV2${int(10000000, 99999999)}${int(100000, 999999)}`,
          plate: `01 ${String.fromCharCode(65 + (i % 26))} ${int(100, 999)} ${pick(["AA", "BA", "KA", "MA"])}`,
          status: i === 12 ? "MAINTENANCE" : i === 13 ? "OUT_OF_SERVICE" : "ACTIVE",
          odometerKm: odo,
          nextServiceKm: odo + (i === 4 ? 800 : int(3_000, 25_000)),
          fuelCapacityL: pick([500, 600, 800]),
          insuranceExpiry: new Date(now + (i === 2 ? 9 : int(40, 360)) * DAY),
          inspectionExpiry: new Date(now + (i === 6 ? 18 : int(40, 360)) * DAY),
          lat: home.lat + between(-0.03, 0.03), lng: home.lng + between(-0.03, 0.03),
          speedKmh: 0, heading: 0, lastPingAt: new Date(now - int(1, 90) * 60_000), pingSource: "SIMULATED",
          driverId: i < drivers.length - 2 ? drivers[i].id : null,
        },
      }),
    );
  }

  const trailerTypes = ["DRY_VAN", "DRY_VAN", "REEFER", "FLATBED", "TANKER", "CONTAINER"] as const;
  const trailers: Trailer[] = [];
  for (let i = 0; i < 16; i++) {
    const type = trailerTypes[i % trailerTypes.length];
    trailers.push(await db.trailer.create({
      data: {
        unitNumber: `TR-${String(201 + i)}`, type,
        capacityKg: type === "TANKER" ? 30_000 : type === "FLATBED" ? 24_000 : 22_000,
        plate: `01 ${int(100, 999)} ${pick(["XA", "XB"])}`,
        status: i === 15 ? "MAINTENANCE" : "ACTIVE",
      },
    }));
  }

  // ---------- Customers ----------
  const customerSeed = [
    ["Silk Road Textiles", "Tashkent", "Kamola Rahimova"], ["Samarkand Agro Export", "Samarkand", "Ravshan Tojiev"],
    ["Fergana Cotton Group", "Fergana", "Laziz Qodirov"], ["UzAuto Components", "Andijan", "Oybek Nurmatov"],
    ["Navoi Mining Supply", "Navoi", "Gulnora Salieva"], ["Almaty Retail Distribution", "Almaty", "Ainur Bekova"],
    ["Bishkek Foods LLC", "Bishkek", "Azamat Osmonov"], ["Tashkent Pharma", "Tashkent", "Nigora Azimova"],
    ["Khorezm Building Materials", "Urgench", "Sanjar Babaev"], ["Caspian Chemicals", "Ashgabat", "Merdan Ataev"],
    ["Termez Cargo Hub", "Termez", "Shukhrat Olimov"], ["Orient Beverages", "Tashkent", "Madina Khodjaeva"],
  ];
  const customers: Customer[] = [];
  for (const [name, c, contact] of customerSeed) {
    customers.push(await db.customer.create({
      data: {
        name, city: c, contactName: contact,
        email: `logistics@${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`,
        phone: `+998 71 ${int(100, 999)} ${int(10, 99)} ${int(10, 99)}`,
        address: `${int(1, 120)} ${pick(["Amir Temur", "Navoi", "Mustaqillik", "Bobur", "Shota Rustaveli"])} str.`,
        country: { Almaty: "Kazakhstan", Bishkek: "Kyrgyzstan", Ashgabat: "Turkmenistan" }[c] ?? "Uzbekistan",
        taxId: String(int(300000000, 399999999)),
        paymentTerms: pick([15, 30, 30, 45, 60]),
        creditLimit: pick([25_000, 50_000, 100_000, 150_000]),
      },
    }));
  }

  // ---------- Loads ----------
  const lanes: [string, string][] = [
    ["Tashkent", "Samarkand"], ["Tashkent", "Almaty"], ["Tashkent", "Bukhara"], ["Fergana", "Tashkent"],
    ["Samarkand", "Termez"], ["Tashkent", "Bishkek"], ["Andijan", "Tashkent"], ["Navoi", "Tashkent"],
    ["Tashkent", "Urgench"], ["Bukhara", "Ashgabat"], ["Tashkent", "Dushanbe"], ["Namangan", "Shymkent"],
    ["Tashkent", "Nukus"], ["Karshi", "Tashkent"], ["Tashkent", "Khujand"], ["Samarkand", "Almaty"],
  ];
  const commodities = [
    ["Cotton yarn", "DRY_VAN"], ["Fresh fruit", "REEFER"], ["Auto parts", "DRY_VAN"], ["Steel pipes", "FLATBED"],
    ["Pharmaceuticals", "REEFER"], ["Cement bags", "FLATBED"], ["Beverages", "DRY_VAN"], ["Diesel fuel", "TANKER"],
    ["Consumer electronics", "CONTAINER"], ["Textiles", "DRY_VAN"], ["Frozen poultry", "REEFER"], ["Fertilizer", "DRY_VAN"],
  ] as const;

  let ref = 10_001;
  const loadRows: Parameters<typeof db.load.create>[0]["data"][] = [];

  function makeLoad(status: string, pickupAt: Date, truckIdx: number | null) {
    const [o, d] = pick(lanes);
    const origin = city(o), dest = city(d);
    const distanceKm = roadKm(origin, dest);
    const [commodity, equipment] = pick(commodities);
    const rate = Math.round((distanceKm * between(1.35, 2.1) + 150) / 10) * 10;
    const truck = truckIdx !== null ? trucks[truckIdx] : null;
    const driver = truck?.driverId ? drivers.find((x) => x.id === truck.driverId)! : null;
    const trailer = truckIdx !== null ? trailers.find((t) => t.type === equipment) ?? trailers[0] : null;
    const hours = distanceKm / 58;
    const deliveryAt = new Date(pickupAt.getTime() + (hours + int(4, 20)) * 3_600_000);
    const departedAt = ["IN_TRANSIT", "DELIVERED", "INVOICED"].includes(status) ? new Date(pickupAt.getTime() + int(0, 90) * 60_000) : null;
    const deliveredAt = departedAt && status !== "IN_TRANSIT"
      ? new Date(departedAt.getTime() + hours * 3_600_000 * between(0.9, 1.25) + (rnd() < 0.12 ? int(20, 40) * 3_600_000 : 0)) : null; // ~12% late
    const driverPay = driver ? Math.round(distanceKm * driver.payPerKm) : 0;
    return {
      reference: `LD-${ref++}`,
      customerId: pick(customers).id,
      status,
      priority: pick(["NORMAL", "NORMAL", "NORMAL", "HIGH", "LOW", "URGENT"]),
      originName: `${o} ${pick(["Logistics Park", "Warehouse #2", "Industrial Zone", "Terminal", "DC"])}`,
      originCity: o, originLat: origin.lat, originLng: origin.lng,
      destName: `${d} ${pick(["Distribution Center", "Customer Site", "Free Zone", "Warehouse", "Market"])}`,
      destCity: d, destLat: dest.lat, destLng: dest.lng,
      pickupAt, deliveryAt, distanceKm,
      commodity, equipment,
      weightKg: int(6, 22) * 1000,
      pallets: equipment === "TANKER" ? null : int(10, 33),
      temperatureC: equipment === "REEFER" ? pick([-18, 2, 4]) : null,
      hazmat: commodity === "Diesel fuel",
      rate, driverPay,
      fuelCost: Math.round(distanceKm * 0.32 * 0.95),
      otherCost: int(0, 3) * 25,
      truckId: truck?.id ?? null, trailerId: trailer?.id ?? null, driverId: driver?.id ?? null,
      dispatcherId: pick(dispatchers).id,
      departedAt, deliveredAt,
      podSignedBy: deliveredAt ? pick(["A. Karimov", "Warehouse mgr", "S. Ivanova", "Security desk"]) : null,
      createdAt: new Date(Math.min(pickupAt.getTime() - 2 * DAY, now - int(30, 900) * 60_000)),
    };
  }

  // History: ~6 months of completed work
  for (let d = 180; d > 3; d -= between(1.2, 2.4)) {
    const status = d > 20 ? "INVOICED" : pick(["DELIVERED", "INVOICED"]);
    loadRows.push(makeLoad(status, new Date(now - d * DAY), int(0, 11)));
  }
  // Currently in transit on trucks 0..7 (mid-route)
  for (let i = 0; i < 8; i++) {
    const l = makeLoad("IN_TRANSIT", new Date(), i);
    const hours = l.distanceKm / 58;
    const departed = new Date(now - hours * between(0.12, 0.85) * 3_600_000);
    l.departedAt = departed;
    l.pickupAt = new Date(departed.getTime() - 30 * 60_000);
    l.deliveryAt = new Date(departed.getTime() + (hours + int(2, 10)) * 3_600_000);
    loadRows.push(l);
  }
  // Assigned (upcoming) on trucks 8..10
  for (let i = 8; i < 11; i++) loadRows.push(makeLoad("ASSIGNED", new Date(now + between(3, 30) * 3_600_000), i));
  // Planned / unassigned backlog
  for (let i = 0; i < 7; i++) loadRows.push(makeLoad("PLANNED", new Date(now + between(8, 120) * 3_600_000), null));
  loadRows.push(makeLoad("CANCELLED", new Date(now - 6 * DAY), null));

  const loads = [];
  for (const row of loadRows) loads.push(await db.load.create({ data: row }));

  // Driver/truck status to match active loads + final truck positions
  for (const l of loads) {
    if (l.status === "IN_TRANSIT" && l.driverId) await db.driver.update({ where: { id: l.driverId }, data: { status: "DRIVING" } });
    if (l.status === "ASSIGNED" && l.driverId) await db.driver.update({ where: { id: l.driverId }, data: { status: "ON_DUTY" } });
    if (l.status === "IN_TRANSIT" && l.truckId) {
      const t = (now - l.departedAt!.getTime()) / ((l.distanceKm / 58) * 3_600_000);
      const p = pointOnRoute({ lat: l.originLat, lng: l.originLng }, { lat: l.destLat, lng: l.destLng }, t);
      await db.truck.update({ where: { id: l.truckId }, data: { lat: p.lat, lng: p.lng, speedKmh: 70, lastPingAt: new Date() } });
    }
    if (l.status === "ASSIGNED" && l.truckId) {
      await db.truck.update({ where: { id: l.truckId }, data: { lat: l.originLat + 0.01, lng: l.originLng + 0.01 } });
    }
  }

  // Events timeline
  for (const l of loads) {
    const ev: { type: string; message: string; createdAt: Date; userId?: string }[] = [
      { type: "CREATED", message: `Load created for ${l.commodity}`, createdAt: new Date(l.pickupAt.getTime() - 2 * DAY), userId: l.dispatcherId ?? undefined },
    ];
    if (l.truckId) ev.push({ type: "ASSIGNED", message: "Truck, trailer and driver assigned", createdAt: new Date(l.pickupAt.getTime() - DAY), userId: l.dispatcherId ?? undefined });
    if (l.departedAt) ev.push({ type: "STATUS", message: `Picked up at ${l.originName} — in transit`, createdAt: l.departedAt });
    if (l.status === "IN_TRANSIT") ev.push({ type: "CHECK_CALL", message: "Driver check-in: road clear, on schedule", createdAt: new Date(now - int(10, 120) * 60_000) });
    if (l.deliveredAt) ev.push({ type: "STATUS", message: `Delivered. POD signed by ${l.podSignedBy}`, createdAt: l.deliveredAt });
    if (l.status === "CANCELLED") ev.push({ type: "STATUS", message: "Cancelled by customer", createdAt: new Date(l.pickupAt.getTime() - 12 * 3_600_000) });
    // Never timestamp history in the future (upcoming loads were "booked" recently).
    const clamp = (d: Date) => new Date(Math.min(d.getTime(), now - int(5, 600) * 60_000));
    await db.loadEvent.createMany({ data: ev.map((e) => ({ ...e, createdAt: clamp(e.createdAt), loadId: l.id })) });
  }

  // Invoices
  let inv = 5001;
  for (const l of loads.filter((x) => x.status === "INVOICED")) {
    const c = customers.find((x) => x.id === l.customerId)!;
    const issuedAt = new Date(l.deliveredAt!.getTime() + DAY);
    const dueAt = new Date(issuedAt.getTime() + c.paymentTerms * DAY);
    const age = (now - issuedAt.getTime()) / DAY;
    // Most old invoices are paid; a few recent ones slip past due.
    const paid = age > c.paymentTerms * 1.6 ? rnd() > 0.03 : age > c.paymentTerms * 0.7 && rnd() > 0.3;
    await db.invoice.create({
      data: {
        number: `INV-${inv++}`, customerId: c.id, loadId: l.id, amount: l.rate,
        status: paid ? "PAID" : "SENT", issuedAt, dueAt,
        paidAt: paid ? new Date(Math.min(now, issuedAt.getTime() + between(0.5, 1.1) * c.paymentTerms * DAY)) : null,
      },
    });
  }

  // Maintenance & fuel
  const mTypes = [["OIL_CHANGE", "Engine oil & filters"], ["TIRES", "Replace steer tires"], ["INSPECTION", "Annual technical inspection"],
    ["REPAIR", "Brake pads & discs"], ["PREVENTIVE", "Full PM service"], ["REPAIR", "Air compressor replacement"]] as const;
  for (const t of trucks) {
    for (let k = 0; k < int(2, 5); k++) {
      const [type, description] = pick(mTypes);
      const at = new Date(now - int(5, 170) * DAY);
      await db.maintenanceRecord.create({ data: { truckId: t.id, type, description, status: "DONE", scheduledAt: at, completedAt: at, cost: int(80, 2400), vendor: pick(["UzTruck Service", "Volvo Center Tashkent", "MAN Service Chirchiq", "In-house"]), odometerKm: t.odometerKm - int(1000, 30000) } });
    }
    if (rnd() > 0.5) {
      const [type, description] = pick(mTypes);
      await db.maintenanceRecord.create({ data: { truckId: t.id, type, description, status: "SCHEDULED", scheduledAt: new Date(now + int(1, 25) * DAY), cost: int(100, 1500), vendor: "UzTruck Service" } });
    }
    for (let k = 0; k < 10; k++) {
      const liters = int(180, 520);
      await db.fuelLog.create({ data: { truckId: t.id, driverId: t.driverId, liters, cost: Math.round(liters * between(0.9, 1.05)), station: pick(["UzGasOil #14", "Lukoil M39", "Saneg A-380", "Mustang Fuel"]), date: new Date(now - int(1, 120) * DAY), odometerKm: t.odometerKm - int(500, 20000) } });
    }
  }
  const t13 = trucks[12];
  await db.maintenanceRecord.create({ data: { truckId: t13.id, type: "REPAIR", description: "Gearbox overhaul", status: "IN_PROGRESS", scheduledAt: new Date(now - 2 * DAY), cost: 3800, vendor: "Scania Service Tashkent" } });

  await db.auditLog.create({ data: { userId: users[0].id, action: "seed", entity: "system", details: "Demo data loaded" } });

  console.log(`Seeded ${users.length + drivers.length} users, ${trucks.length} trucks, ${trailers.length} trailers, ${customers.length} customers, ${loads.length} loads.`);
  if (!process.env.DEMO_PASSWORD) console.log(`All demo accounts use password: ${DEMO_PASSWORD}`);
  else console.log("All demo accounts use the DEMO_PASSWORD you provided.");
}

main().finally(() => db.$disconnect());
