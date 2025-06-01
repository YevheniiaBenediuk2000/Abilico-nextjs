const ICON_RULES = [
  {
    k: "poi",
    v: "accommodation.hostel",
    condition: {
      k: "tourism",
      v: "hostel",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Hostel",
        lang: "en",
      },
      {
        _: "Herberge",
        lang: "de",
      },
    ],
    description: {
      _: "Hostel is something between a Hotel and a youth Hostel",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.hotel",
    condition: {
      k: "tourism",
      v: "hotel",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Hotel",
        lang: "de",
      },
      {
        _: "Hotel",
        lang: "en",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.school",
    condition: {
      k: "amenity",
      v: "school",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "School",
        lang: "en",
      },
      {
        _: "Schule",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.icecream",
    condition: {
      k: "cuisine",
      v: "icecream",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Icecream",
        lang: "en",
      },
      {
        _: "Eisdiele",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.pub",
    condition: {
      k: "amenity",
      v: "pub",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Pub",
        lang: "en",
      },
      {
        _: "Kneipe",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Restaurant",
        lang: "en",
      },
      {
        _: "Restaurant",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.hospital",
    condition: {
      k: "amenity",
      v: "hospital",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Hospital",
        lang: "en",
      },
      {
        _: "Krankenhaus",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.pharmacy",
    condition: {
      k: "amenity",
      v: "pharmacy",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Pharmacy",
        lang: "en",
      },
      {
        _: "Apotheke",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "place.peak",
    condition: {
      k: "natural",
      v: "peak",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Peak",
        lang: "en",
      },
      {
        _: "Gipfel",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "place.settlement.city",
    condition: {
      k: "place",
      v: "city",
    },
    scale_min: "10000",
    scale_max: "750000",
    title: [
      {
        _: "City",
        lang: "en",
      },
      {
        _: "Größere Stadt",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Settlement from 25000 up to 200000 inhabitants",
        lang: "en",
      },
      {
        _: "Siedlung mit 25.000 bis 200.000 Einwohnern",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "place.settlement.hamlet",
    condition: {
      k: "place",
      v: "hamlet",
    },
    scale_min: "1",
    scale_max: "100000",
    title: [
      {
        _: "Hamlet",
        lang: "en",
      },
      {
        _: "Weiler",
        lang: "de",
      },
    ],
    description: [
      {
        _: "very small settlements, which are not even a village",
        lang: "en",
      },
      {
        _: "sehr kleine Ansiedlungen, die noch kein Dorf sind",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "place.settlement.suburb",
    condition: {
      k: "place",
      v: "suburb",
    },
    scale_min: "1",
    scale_max: "20000",
    title: [
      {
        _: "Suburb",
        lang: "en",
      },
      {
        _: "Stadteil",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Area inside a Settlement",
        lang: "en",
      },
      {
        _: "Gebiet in einer Stadt",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "place.settlement.town",
    condition: {
      k: "place",
      v: "town",
    },
    scale_min: "1",
    scale_max: "300000",
    title: [
      {
        _: "Town",
        lang: "en",
      },
      {
        _: "Kleinstadt",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Settlement with up to 25000 inhabitants",
        lang: "en",
      },
      {
        _: "Siedlung mit bis zu 25.000 Einwohnern ",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "place.settlement.village",
    condition: {
      k: "place",
      v: "village",
    },
    scale_min: "1",
    scale_max: "200000",
    title: [
      {
        _: "Village",
        lang: "en",
      },
      {
        _: "Dorf",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Settlement with less than 2000 inhabitants",
        lang: "en",
      },
      {
        _: "Siedlung mit weniger als 2.000 Einwohnern",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "service.firebrigade",
    condition: {
      k: "amenity",
      v: "fire_station",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Firebrigade",
        lang: "en",
      },
      {
        _: "Feuerwehr",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.police",
    condition: {
      k: "amenity",
      v: "police",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Police Station",
        lang: "en",
      },
      {
        _: "Polizeirevier",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.post_box",
    condition: {
      k: "amenity",
      v: "post_box",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Post Box",
        lang: "en",
      },
      {
        _: "Briefkasten",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.post_office",
    condition: {
      k: "amenity",
      v: "post_office",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Post Office",
        lang: "en",
      },
      {
        _: "Postamt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.recycling",
    condition: {
      k: "amenity",
      v: "recycling",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Recycling",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.telephone",
    condition: {
      k: "amenity",
      v: "telephone",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Public Phone",
        lang: "en",
      },
      {
        _: "Öffentliches Telefon",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.toilets",
    condition: {
      k: "amenity",
      v: "toilets",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Toilets",
        lang: "en",
      },
      {
        _: "Toilette",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.toilets.wheelchair",
    condition: {
      k: "amenity",
      v: "toilets",
    },
    condition_2nd: {
      k: "wheelchair",
      v: "yes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Wheelchair-accessible restroom",
        lang: "en",
      },
      {
        _: "Behindertentoilette",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.toilets.ladies",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Ladies' room",
        lang: "en",
      },
      {
        _: "Damentoilette",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.toilets.gents",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Boys' room",
        lang: "en",
      },
      {
        _: "Herrentoilette",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.toilets.gents.urinal",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Urinal",
        lang: "en",
      },
      {
        _: "Pissoir",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.cinema",
    condition: {
      k: "amenity",
      v: "cinema",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Cinema",
        lang: "en",
      },
      {
        _: "Kino",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.playground",
    condition: [
      {
        k: "leisure",
        v: "playground",
      },
      {
        k: "amenity",
        v: "playground",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Playground",
        lang: "en",
      },
      {
        _: "Spielplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.bakery",
    condition: [
      {
        k: "shop",
        v: "bakery",
      },
      {
        k: "amenity",
        v: "bakery",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Bakery",
        lang: "en",
      },
      {
        _: "Bäckerei",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.library",
    condition: {
      k: "amenity",
      v: "library",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Public library",
        lang: "en",
      },
      {
        _: "Bibliothek",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.supermarket",
    condition: [
      {
        k: "shop",
        v: "supermarket",
      },
      {
        k: "amenity",
        v: "supermarket",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Supermarket",
        lang: "en",
      },
      {
        _: "Supermarkt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sightseeing",
    condition: [
      {
        k: "tourism",
        v: "attraction",
      },
      {
        k: "leisure",
        v: "point_of_interest",
      },
    ],
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Sehenswürdigkeit",
        lang: "de",
      },
      {
        _: "Sightseeing",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Historische Orte und andere interessante Bauwerke",
        lang: "de",
      },
      {
        _: "Historic places and other interesting buildings",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "sightseeing.castle",
    condition: {
      k: "historic",
      v: "castle",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Castle",
        lang: "en",
      },
      {
        _: "Burg",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sightseeing.monument",
    condition: {
      k: "historic",
      v: "monument",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Monument",
        lang: "en",
      },
      {
        _: "Monument",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sightseeing.viewpoint",
    condition: {
      k: "tourism",
      v: "viewpoint",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Viewpoint",
        lang: "en",
      },
      {
        _: "Aussichtspunkt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.golf",
    condition: {
      k: "sport",
      v: "golf",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Golf course",
        lang: "en",
      },
      {
        _: "Golfplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.curling",
    condition: {
      k: "sport",
      v: "curling",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Curling",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.fuel",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Fuel Station",
        lang: "en",
      },
      {
        _: "Tankstelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking",
    condition: {
      k: "amenity",
      v: "parking",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Parking",
        lang: "en",
      },
      {
        _: "Parkplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint",
    condition: {
      k: "class",
      v: "waypoint",
    },
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Wegpunkt",
        lang: "de",
      },
      {
        _: "Waypoint",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Wegpunkte, um z.B. temporäre Punkte zu markieren",
        lang: "de",
      },
      {
        _: "Waypoints, for example to temporarily mark several places",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "accommodation",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Unterkunft",
        lang: "de",
      },
      {
        _: "Accommodation",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Hotels, Jugendherbergen, Campingplätze",
        lang: "de",
      },
      {
        _: "Places to stay",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "accommodation.camping",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Camping site",
        lang: "en",
      },
      {
        _: "Campingplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.camping.caravan",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Caravan site",
        lang: "en",
      },
      {
        _: "Wohnwagenstellplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.camping.dump_station",
    scale_min: "1",
    scale_max: "20000",
    title: [
      {
        _: "Dump station",
        lang: "en",
      },
      {
        _: "Entleerungsstelle",
        lang: "de",
      },
    ],
    description: {
      _: "A facility where campers can dump their waste water",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.camping.gas_refill",
    scale_min: "1",
    scale_max: "20000",
    title: [
      {
        _: "Gas refill facility",
        lang: "en",
      },
      {
        _: "Gasversorgung ",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.camping.hookup",
    scale_min: "1",
    scale_max: "20000",
    title: [
      {
        _: "Power hookup",
        lang: "en",
      },
      {
        _: "Stromanschluss",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.chalet",
    condition: {
      k: "tourism",
      v: "chalet",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Chalet",
        lang: "en",
      },
      {
        _: "Chalet",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Leisure residence",
        lang: "en",
      },
      {
        _: "Ferienhaus",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "accommodation.guest_house",
    condition: {
      k: "tourism",
      v: "guest_house",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Guest House",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.motel",
    condition: {
      k: "tourism",
      v: "motel",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Motel",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.shelter",
    condition: {
      k: "amenity",
      v: "shelter",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Shelter",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "accommodation.youth-hostel",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Youth Hostel",
        lang: "en",
      },
      {
        _: "Jugendherberge",
        lang: "de",
      },
    ],
    description: {
      _: "Youth Hostel",
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "education",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Bildung",
        lang: "de",
      },
      {
        _: "Education",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Schulen und andere Bildungseinrichtungen",
        lang: "de",
      },
      {
        _: "Schools and other educational facilities",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "education.adult",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Adult Education",
        lang: "en",
      },
      {
        _: "Erwachsenenbildung",
        lang: "de",
      },
    ],
    description: [
      {
        lang: "en",
      },
      {
        _: "Volkshochschulen, Abendkurse, usw.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "education.college",
    condition: {
      k: "amenity",
      v: "college",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "College",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.nursery",
    condition: {
      k: "amenity",
      v: "nursery",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Nursery",
        lang: "en",
      },
      {
        _: "Kinderhort",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.kindergarten",
    condition: {
      k: "amenity",
      v: "kindergarten",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Kindergarten",
        lang: "en",
      },
      {
        _: "Kindergarten",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.school.highschool",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Highschool",
        lang: "en",
      },
      {
        _: "Gymnasium",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.school.junior_high",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Junior High",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.school.primary",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Primary School",
        lang: "en",
      },
      {
        _: "Grundschule",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.school.secondary",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Secondary School",
        lang: "en",
      },
      {
        _: "Hauptschule/Realschule",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.school.vocational",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Vocational School",
        lang: "en",
      },
      {
        _: "Berufsschule",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "education.university",
    condition: {
      k: "amenity",
      v: "university",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "University",
        lang: "en",
      },
      {
        _: "Universität",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Speiselokal",
        lang: "de",
      },
      {
        _: "Food",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Restaurants, Bars, usw.",
        lang: "de",
      },
      {
        _: "Restaurants, Bars, and so on...",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "food.bar",
    condition: {
      k: "amenity",
      v: "bar",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Bar",
        lang: "en",
      },
      {
        _: "Bar",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.beergarden",
    condition: {
      k: "amenity",
      v: "biergarten",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Beergarden",
        lang: "en",
      },
      {
        _: "Biergarten",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.cafe",
    condition: {
      k: "amenity",
      v: "cafe",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Cafe",
        lang: "en",
      },
      {
        _: "Cafe",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.fast_food",
    condition: {
      k: "amenity",
      v: "fast_food",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Fastfood",
        lang: "en",
      },
      {
        _: "Schnellrestaurant",
        lang: "de",
      },
    ],
    description: {
      _: "Fastfood-Restaurant",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.fast_food.burger_king",
    condition: {
      k: "amenity",
      v: "fast_food",
    },
    condition_2nd: {
      k: "name",
      v: "Burger King",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Burger King",
        lang: "en",
      },
      {
        _: "Burger King",
        lang: "de",
      },
    ],
    description: {
      _: "Burger King Restaurant",
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "food.fast_food.kfc",
    condition: {
      k: "amenity",
      v: "fast_food",
    },
    condition_2nd: {
      k: "name",
      v: "Kentucky Fried Chicken",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "KFC",
        lang: "en",
      },
      {
        _: "Kentucky Fried Chicken",
        lang: "de",
      },
    ],
    description: {
      _: "Kentucky Fried Chicken Restaurant",
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "food.fast_food.mc_donalds",
    condition: {
      k: "amenity",
      v: "fast_food",
    },
    condition_2nd: {
      k: "name",
      v: "McDonald's",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "McDonalds",
        lang: "en",
      },
      {
        _: "McDonalds",
        lang: "de",
      },
    ],
    description: {
      _: "McDonalds Restaurant",
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "food.fast_food.subway",
    condition: {
      k: "amenity",
      v: "fast_food",
    },
    condition_2nd: {
      k: "name",
      v: "Subway",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Subway",
        lang: "en",
      },
      {
        _: "Subway",
        lang: "de",
      },
    ],
    description: {
      _: "Subway Sandwich Restaurant",
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "food.fast_food.pizza_hut",
    condition: {
      k: "amenity",
      v: "fast_food",
    },
    condition_2nd: {
      k: "name",
      v: "Pizza Hut",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Pizzahut",
        lang: "en",
      },
      {
        _: "Pizzahut",
        lang: "de",
      },
    ],
    description: {
      _: "Pizzahut Restaurant",
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "food.restaurant.chinese",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "chinese",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Chinese Restaurant",
        lang: "en",
      },
      {
        _: "Chinesisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.german",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "german",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "German Restaurant",
        lang: "en",
      },
      {
        _: "Deutsch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.greek",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "greek",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Greek Restaurant",
        lang: "en",
      },
      {
        _: "Griechisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.indian",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "indian",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Indian Restaurant",
        lang: "en",
      },
      {
        _: "Indisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.italian",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "italian",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Italian Restaurant",
        lang: "en",
      },
      {
        _: "Italienisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.japanese",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "japanese",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Japanese Restaurant",
        lang: "en",
      },
      {
        _: "Japanisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.mexican",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "mexican",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Mexican Restaurant",
        lang: "en",
      },
      {
        _: "Mexikanisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.african",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "african",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "African Restaurant",
        lang: "en",
      },
      {
        _: "Afrikanisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.arabian",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "arabian",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Arabian Restaurant",
        lang: "en",
      },
      {
        _: "Arabisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.asian",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "asian",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Asian Restaurant",
        lang: "en",
      },
      {
        _: "Asiatisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.brazilian",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "brazilian",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Brazilian Restaurant",
        lang: "en",
      },
      {
        _: "Brasilianisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.balkans",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "balkans",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Balkans Restaurant",
        lang: "en",
      },
      {
        _: "Balkan",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.french",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "french",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "French Restaurant",
        lang: "en",
      },
      {
        _: "French",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.korean",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "korean",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Korean Restaurant",
        lang: "en",
      },
      {
        _: "Koreanisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.spanish",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "spanish",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Spanish Restaurant",
        lang: "en",
      },
      {
        _: "Spanisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.thai",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "thai",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Thai Restaurant",
        lang: "en",
      },
      {
        _: "Thai",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.restaurant.bavarian",
    condition: {
      k: "amenity",
      v: "restaurant",
    },
    condition_2nd: {
      k: "cuisine",
      v: "bavarian",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Bavarian Restaurant",
        lang: "en",
      },
      {
        _: "Bayrisch",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.snacks",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Snack Stand",
        lang: "en",
      },
      {
        _: "Imbissbude",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.snacks.pizza",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Pizzasnacks",
        lang: "en",
      },
      {
        _: "Pizzaimbiss",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.tea_shop",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Tea Shop",
        lang: "en",
      },
      {
        _: "Teestube",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "food.wine_tavern",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Wine Tavern",
        lang: "en",
      },
      {
        _: "Weinstube",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Geocache",
        lang: "de",
      },
      {
        _: "Geocache",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Geocaches",
        lang: "de",
      },
      {
        _: "Geocaches",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "geocache.geocache_earth",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Earthcache",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_event",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Eventcache",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_found",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Found Cache",
        lang: "en",
      },
      {
        _: "Gefundener Cache",
        lang: "de",
      },
    ],
    description: [
      {
        _: "A Geocache you have already logged as found",
        lang: "en",
      },
      {
        _: "Ein Geocache, der bereits als gefunden geloggt wurde",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "geocache.geocache_multi",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Multicache",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage01",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 01",
      lang: "en",
    },
    description: {
      _: "Stage 01 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage02",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 02",
      lang: "en",
    },
    description: {
      _: "Stage 02 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage03",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 03",
      lang: "en",
    },
    description: {
      _: "Stage 03 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage04",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 04",
      lang: "en",
    },
    description: {
      _: "Stage 04 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage05",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 05",
      lang: "en",
    },
    description: {
      _: "Stage 05 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage06",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 06",
      lang: "en",
    },
    description: {
      _: "Stage 06 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage07",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 07",
      lang: "en",
    },
    description: {
      _: "Stage 07 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage08",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 08",
      lang: "en",
    },
    description: {
      _: "Stage 08 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage09",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 09",
      lang: "en",
    },
    description: {
      _: "Stage 09 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_multi.multi_stage10",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stage 10",
      lang: "en",
    },
    description: {
      _: "Stage 10 of a Multicache",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_mystery",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Mysterycache",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_night",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Nightcache",
        lang: "en",
      },
      {
        _: "Nachtcache",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_traditional",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Traditional",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_virtual",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Virtual Cache",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "geocache.geocache_webcam",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Webcam Cache",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Gesundheit",
        lang: "de",
      },
      {
        _: "Health",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Krankenhäuser, Ärzte, Apotheken",
        lang: "de",
      },
      {
        _: "Hospital, Doctor, Pharmacy, etc.",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "health.chemist",
    condition: {
      k: "shop",
      v: "chemist",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Chemist",
        lang: "en",
      },
      {
        _: "Drogerie",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.dentist",
    condition: {
      k: "amenity",
      v: "dentist",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Dentist",
        lang: "en",
      },
      {
        _: "Zahnarzt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.doctor",
    condition: {
      k: "amenity",
      v: "doctors",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Doctor",
        lang: "en",
      },
      {
        _: "Arzt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.hospital.emergency",
    condition: {
      k: "amenity",
      v: "hospital",
    },
    condition_2nd: {
      k: "emergency",
      v: "yes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Emergency Room",
        lang: "en",
      },
      {
        _: "Notaufnahme",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.eye_specialist",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Eye Specialist",
        lang: "en",
      },
      {
        _: "Augenarzt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.optician",
    condition: {
      k: "shop",
      v: "optician",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Optician",
        lang: "en",
      },
      {
        _: "Optiker",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.hearing_aid",
    condition: {
      k: "shop",
      v: "hearing_aid",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Hearing Aid",
        lang: "en",
      },
      {
        _: "Akustiker",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.physiotherapy",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Physiotherapy",
        lang: "en",
      },
      {
        _: "Physiotherapie",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "health.veterinary",
    condition: {
      k: "amenity",
      v: "veterinary",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Veterinary",
        lang: "en",
      },
      {
        _: "Tierarzt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Verschiedenes",
        lang: "de",
      },
      {
        _: "Miscellaneous",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Eigenkreationen, und Punkte, die in keine der anderen Kategorien passen",
        lang: "de",
      },
      {
        _: "POIs not suitable for another category, and custom types",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "service.information",
    condition: {
      k: "tourism",
      v: "information",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Information",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.information.desk",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Information desk",
        lang: "en",
      },
      {
        _: "Informationsschalter",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.information.point",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Information point",
        lang: "en",
      },
      {
        _: "Informationspunkt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "misc.stile",
    condition: [
      {
        k: "highway",
        v: "stile",
      },
      {
        k: "barrier",
        v: "stile",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stile",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Landmark",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.barn",
    condition: {
      k: "man_made",
      v: "barn",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Barn",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.beacon",
    condition: {
      k: "man_made",
      v: "beacon",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Beacon",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.bunker",
    condition: {
      k: "military",
      v: "bunker",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Bunker",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "place.cave_entrance",
    condition: {
      k: "natural",
      v: "cave_entrance",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Cave Entrance",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.chimney",
    condition: {
      k: "man_made",
      v: "chimney",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "chimney",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.crane",
    condition: {
      k: "man_made",
      v: "crane",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "crane",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.gasometer",
    condition: {
      k: "man_made",
      v: "gasometer",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Gasometer",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.lighthouse",
    condition: {
      k: "man_made",
      v: "lighthouse",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Lighthouse",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.mine",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Mine",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.mountain_pass",
    condition: {
      k: "mountain_pass",
      v: "yes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Mountain pass",
        lang: "en",
      },
      {
        _: "Bergpass",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Highest point on a mountain pass",
        lang: "en",
      },
      {
        _: "Höchster Punkt auf einem Bergpass",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "nautical.pier",
    condition: {
      k: "man_made",
      v: "pier",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Pier",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power",
    condition: {
      k: "power",
      v: "generator",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Power generator",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.gas",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "gas",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Gas-fired power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.biofuel",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "biofuel",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Biofuel-fired power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.oil",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "oil",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Oil-fired power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.coal",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "coal",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Coal-fired power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.waste",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "waste",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Waste-fired power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.hydro",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "hydro",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Hydropower plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.tidal",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "tidal",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Tidal power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.geothermal",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "geothermal",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Geothermal power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.nuclear",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "nuclear",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Nuclear power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.photovoltaic",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "photovoltaic",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Photovoltaic power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.solarthermal",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "solarthermal",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Solarthermal power plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.tower",
    condition: {
      k: "power",
      v: "tower",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Power tower",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.power.wind",
    condition: {
      k: "power",
      v: "generator",
    },
    condition_2nd: {
      k: "power_source",
      v: "wind",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Wind turbine tower",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.range",
    condition: {
      k: "military",
      v: "range",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Shooting Range",
      lang: "en",
    },
    description: {
      _: "A military shooting range",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.reservoir_covered",
    condition: {
      k: "man_made",
      v: "reservoir_covered",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Covered reservoir",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "natural.spring",
    condition: {
      k: "natural",
      v: "spring",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Spring",
        lang: "en",
      },
      {
        _: "Quelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.survey_point",
    condition: {
      k: "man_made",
      v: "survey_point",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Survey point",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.tower",
    condition: {
      k: "man_made",
      v: "tower",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Tower",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.wastewater_plant",
    condition: {
      k: "man_made",
      v: "wastewater_plant",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Wastewater plant",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.tower.water",
    condition: {
      k: "man_made",
      v: "water_tower",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Water tower",
        lang: "en",
      },
      {
        _: "Wasserturm",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.windmill",
    condition: {
      k: "man_made",
      v: "windmill",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Windmill",
        lang: "en",
      },
      {
        _: "Windmühle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.watermill",
    condition: {
      k: "man_made",
      v: "watermill",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Watermill",
        lang: "en",
      },
      {
        _: "Wassermühle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.works",
    condition: {
      k: "man_made",
      v: "works",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Works",
        lang: "en",
      },
      {
        _: "Werk",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.drinking_water",
    condition: {
      k: "amenity",
      v: "drinking_water",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Water Dispenser",
        lang: "en",
      },
      {
        _: "Wasserspender",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "money",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Geld",
        lang: "de",
      },
      {
        _: "Money",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Banken, Geldautomaten, und ähnliches",
        lang: "de",
      },
      {
        _: "Bank, ATMs, and other money-related places",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "money.atm",
    condition: {
      k: "amenity",
      v: "atm",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "ATM",
        lang: "en",
      },
      {
        _: "Geldautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "money.atm.cashgroup",
    condition: {
      k: "amenity",
      v: "atm",
    },
    condition_2nd: {
      k: "operator",
      v: "Cashgroup",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Cashgroup ATM",
        lang: "en",
      },
      {
        _: "Geldautomat - Cashgroup",
        lang: "de",
      },
    ],
    description: [
      {
        lang: "en",
      },
      {
        _: "Commerzbank, Deutsche Bank, Dresdner Bank, Postbank, HypoVereinsbank",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "money.atm.sparkasse",
    condition: {
      k: "amenity",
      v: "atm",
    },
    condition_2nd: {
      k: "operator",
      v: "Sparkasse",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Sparkasse ATM",
        lang: "en",
      },
      {
        _: "Geldautomat - Sparkasse",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "money.bank",
    condition: {
      k: "amenity",
      v: "bank",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Bank",
        lang: "en",
      },
      {
        _: "Bank",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "money.bank.deutsche_bank",
    condition: {
      k: "amenity",
      v: "bank",
    },
    condition_2nd: [
      {
        k: "operator",
        v: "Deutsche Bank",
      },
      {
        k: "name",
        v: "Deutsche Bank",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Deutsche Bank",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "money.bank.hvb",
    condition: {
      k: "amenity",
      v: "bank",
    },
    condition_2nd: [
      {
        k: "operator",
        v: "HypoVereinsbank",
      },
      {
        k: "name",
        v: "HypoVereinsbank",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "HypoVereinsbank",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "money.bank.postbank",
    condition: {
      k: "amenity",
      v: "bank",
    },
    condition_2nd: [
      {
        k: "operator",
        v: "Postbank",
      },
      {
        k: "name",
        v: "Postbank",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Postbank",
        lang: "en",
      },
      {
        _: "Postbank",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "money.bank.sparkasse",
    condition: {
      k: "amenity",
      v: "bank",
    },
    condition_2nd: [
      {
        k: "operator",
        v: "Sparkasse",
      },
      {
        k: "name",
        v: "Sparkasse",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Sparkasse",
        lang: "en",
      },
      {
        _: "Sparkasse",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "money.bank.vr-bank",
    condition: {
      k: "amenity",
      v: "bank",
    },
    condition_2nd: [
      {
        k: "operator",
        v: "Volksbank",
      },
      {
        k: "operator",
        v: "Raiffeisenbank",
      },
      {
        k: "name",
        v: "Volksbank",
      },
      {
        k: "name",
        v: "Raiffeisenbank",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Volksbank/Raiffeisenbank",
        lang: "en",
      },
      {
        _: "Volksbank/Raiffeisenbank",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "money.bureau_de_change",
    condition: {
      k: "amenity",
      v: "bureau_de_change",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Money Exchange",
        lang: "en",
      },
      {
        _: "Geldwechsel",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "nautisch",
        lang: "de",
      },
      {
        _: "nautical",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Spezielle nautische Punkte",
        lang: "de",
      },
      {
        _: "Special nautical Points",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "nautical.flag",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Flag",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.flag.alpha",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Alpha Flag",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.boatyard",
    condition: {
      k: "waterway",
      v: "boatyard",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Boatyard",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.flag.diver",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Diver",
        lang: "en",
      },
      {
        _: "Taucher",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.lock_gate",
    condition: {
      k: "waterway",
      v: "lock_gate",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Lock gate",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.marina",
    condition: {
      k: "leisure",
      v: "marina",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Marina",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.slipway",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Slipway",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.turning",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.weir",
    condition: {
      k: "waterway",
      v: "weir",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Weir",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Person",
        lang: "de",
      },
      {
        _: "People",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Dein Zuhause, die Arbeitsstelle, Freunde, und andere Personen",
        lang: "de",
      },
      {
        _: "Your home, work, friends, and other people",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "people.boy",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Boy",
        lang: "en",
      },
      {
        _: "Mann",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.friends",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "friend",
        lang: "en",
      },
      {
        _: "Freund",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "dynamic",
    v: "people.friendsd",
    scale_min: "1",
    scale_max: "10000000",
    title: [
      {
        _: "FRIENDSD",
        lang: "en",
      },
      {
        _: "FRIENDSD",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Other GpsDrive-Users currently online",
        lang: "en",
      },
      {
        _: "Andere GpsDrive-Benutzer, die gerade online sind",
        lang: "de",
      },
    ],
  },
  {
    k: "dynamic",
    v: "people.friendsd.airplane",
    scale_min: "1",
    scale_max: "10000000",
    title: [
      {
        _: "FRIENDSD Airplane",
        lang: "en",
      },
      {
        _: "FRIENDSD Flugzeug",
        lang: "de",
      },
    ],
    description: [
      {
        _: "GPS-Drive User travelling by airplane",
        lang: "en",
      },
      {
        _: "GPS-Drive Benutzer unterwegs mit einem Flugzeug",
        lang: "de",
      },
    ],
  },
  {
    k: "dynamic",
    v: "people.friendsd.bike",
    scale_min: "1",
    scale_max: "10000000",
    title: [
      {
        _: "FRIENDSD Bike",
        lang: "en",
      },
      {
        _: "FRIENDSD Fahrrad",
        lang: "de",
      },
    ],
    description: [
      {
        _: "GPS-Drive User travelling by bike",
        lang: "en",
      },
      {
        _: "GPS-Drive Benutzer unterwegs mit einem Fahrrad",
        lang: "de",
      },
    ],
  },
  {
    k: "dynamic",
    v: "people.friendsd.boat",
    scale_min: "1",
    scale_max: "10000000",
    title: [
      {
        _: "FRIENDSD Boat",
        lang: "en",
      },
      {
        _: "FRIENDSD Boot",
        lang: "de",
      },
    ],
    description: [
      {
        _: "GPS-Drive User travelling by boat",
        lang: "en",
      },
      {
        _: "GPS-Drive Benutzer unterwegs mit einem Boot",
        lang: "de",
      },
    ],
  },
  {
    k: "dynamic",
    v: "people.friendsd.car",
    scale_min: "1",
    scale_max: "10000000",
    title: [
      {
        _: "FRIENDSD Car",
        lang: "en",
      },
      {
        _: "FRIENDSD Auto",
        lang: "de",
      },
    ],
    description: [
      {
        _: "GPS-Drive User travelling by car",
        lang: "en",
      },
      {
        _: "GPS-Drive Benutzer unterwegs mit einem Auto",
        lang: "de",
      },
    ],
  },
  {
    k: "dynamic",
    v: "people.friendsd.walk",
    scale_min: "1",
    scale_max: "10000000",
    title: [
      {
        _: "FRIENDSD Walk",
        lang: "en",
      },
      {
        _: "FRIENDSD zu Fuß",
        lang: "de",
      },
    ],
    description: [
      {
        _: "GPS-Drive User travelling on foot",
        lang: "en",
      },
      {
        _: "GPS-Drive Benutzer zu Fuß unterwegs",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "people.girl",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Girl",
        lang: "en",
      },
      {
        _: "Frau",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.home",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "My Home",
        lang: "en",
      },
      {
        _: "Mein Zuhause",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_a",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "A",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_b",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "B",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_c",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "C",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_d",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "D",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_e",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "E",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_f",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "F",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_g",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "G",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_h",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "H",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_i",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "I",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_j",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "J",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_k",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "K",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_l",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "L",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_m",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "M",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_n",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "N",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_o",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "O",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_p",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "P",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_q",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Q",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_r",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "R",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_s",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "S",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_t",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "T",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_u",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "U",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_v",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "V",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_w",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "W",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_x",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "X",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_y",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Y",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.people_z",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Z",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "people.work",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "My Work",
        lang: "en",
      },
      {
        _: "Arbeitsplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "place",
    scale_min: "10000",
    scale_max: "500000",
    title: [
      {
        _: "Ort",
        lang: "de",
      },
      {
        _: "Place",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Siedlungen, Berggipfel, und anderes geografisches Zeug",
        lang: "de",
      },
      {
        _: "Settlements, Mountains, and other geographical stuff",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "place.island",
    condition: {
      k: "place",
      v: "island",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Island",
        lang: "en",
      },
      {
        _: "Insel",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "place.locality",
    condition: {
      k: "place",
      v: "locality",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Locality",
      lang: "en",
    },
    description: {
      _: "A (usually rural) place that has a name but isn't a settlement.",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "place.settlement",
    scale_min: "1",
    scale_max: "1000000",
    title: [
      {
        _: "Settlement",
        lang: "en",
      },
      {
        _: "Siedlung",
        lang: "de",
      },
    ],
    description: {
      _: "a settlement not closer specified",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "place.settlement.capital",
    scale_min: "100000",
    scale_max: "10000000",
    title: [
      {
        _: "Capital",
        lang: "en",
      },
      {
        _: "Großstadt",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Settlement with more than 200000 inhabitants",
        lang: "en",
      },
      {
        _: "Siedlung mit mehr als 200.000 Einwohnern",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "service",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Öffentlich",
        lang: "de",
      },
      {
        _: "Public services",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Verwaltung und andere öffentliche Einrichtungen",
        lang: "de",
      },
      {
        _: "Public services and Administration",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "service.administration",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Administration",
        lang: "en",
      },
      {
        _: "Verwaltung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.municipal_hall",
    condition: {
      k: "amenity",
      v: "townhall",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Municipal hall",
        lang: "en",
      },
      {
        _: "Stadthalle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.administration.court_of_law",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Court of Law",
        lang: "en",
      },
      {
        _: "Gericht",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.administration.embassy",
    condition: {
      k: "amenity",
      v: "embassy",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Embassy",
        lang: "en",
      },
      {
        _: "Botschaft",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.administration.prison",
    condition: {
      k: "amenity",
      v: "prison",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Prison",
        lang: "en",
      },
      {
        _: "Gefängnis",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.administration.registration_office",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Registration Office",
        lang: "en",
      },
      {
        _: "Einwohnermeldeamt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.administration.tax_office",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Tax Office",
        lang: "en",
      },
      {
        _: "Finanzamt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.administration.townhall",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Townhall",
        lang: "en",
      },
      {
        _: "Rathaus",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.administration.vehicle-registration",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Vehicle Registration",
        lang: "en",
      },
      {
        _: "KFZ-Zulassung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.arts_centre",
    condition: {
      k: "amenity",
      v: "arts_centre",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Arts centre",
        lang: "en",
      },
      {
        _: "Kulturzentrum",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.inspecting-authority",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Inspecting authority",
        lang: "en",
      },
      {
        _: "Prüfstelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.inspecting-authority.dekra",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "DEKRA",
        lang: "en",
      },
      {
        _: "DEKRA",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "service.inspecting-authority.tuev",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "TUEV",
        lang: "en",
      },
      {
        _: "TÜV",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "service.recycling.cans",
    condition: {
      k: "amenity",
      v: "recycling",
    },
    condition_2nd: {
      k: "recycling:cans",
      v: "yes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Used cans",
        lang: "en",
      },
      {
        _: "Dosencontainer",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.recycling.paper",
    condition: {
      k: "amenity",
      v: "recycling",
    },
    condition_2nd: {
      k: "recycling:paper",
      v: "yes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Used paper",
        lang: "en",
      },
      {
        _: "Altpapiercontainer",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.recycling.glass",
    condition: {
      k: "amenity",
      v: "recycling",
    },
    condition_2nd: {
      k: "recycling:glass",
      v: "yes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Used glass",
        lang: "en",
      },
      {
        _: "Altglascontainer",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.recycling.batteries",
    condition: {
      k: "amenity",
      v: "recycling",
    },
    condition_2nd: {
      k: "recycling:batteries",
      v: "yes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Used batteries",
        lang: "en",
      },
      {
        _: "Batteriesammelstelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.recycling.centre",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Recycling centre",
        lang: "en",
      },
      {
        _: "Wertstoffhof",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.recycling.waste_basket",
    condition: {
      k: "amenity",
      v: "waste_basket",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Waste basket",
        lang: "en",
      },
      {
        _: "Mülleimer",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Freizeit",
        lang: "de",
      },
      {
        _: "Leisure",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Freizeiteinrichtungen (kein Sport)",
        lang: "de",
      },
      {
        _: "Places used for recreation (no sports)",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "leisure.common",
    condition: {
      k: "leisure",
      v: "common",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Common",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.music_venue",
    condition: {
      k: "leisure",
      v: "music_venue",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Music venue",
        lang: "en",
      },
      {
        _: "Musik",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.nightclub",
    condition: {
      k: "amenity",
      v: "nightclub",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Nightclub",
        lang: "en",
      },
      {
        _: "Nachtclub",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.nature_reserve",
    condition: {
      k: "leisure",
      v: "nature_reserve",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Nature reserve",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.park",
    condition: {
      k: "leisure",
      v: "park",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Park",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.picnic_site",
    condition: {
      k: "tourism",
      v: "picnic_site",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Picnic site",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.theatre",
    condition: {
      k: "amenity",
      v: "theatre",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Theatre",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.theme_park",
    condition: {
      k: "tourism",
      v: "theme_park",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Theme park",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.water_park",
    condition: {
      k: "leisure",
      v: "water_park",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Water park",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.zoo",
    condition: {
      k: "tourism",
      v: "zoo",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Zoo",
        lang: "en",
      },
      {
        _: "Zoo",
        lang: "de",
      },
    ],
    description: [
      {
        lang: "en",
      },
      {
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "religion",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Religion",
        lang: "de",
      },
      {
        _: "Religion",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Kirchen und andere religiöse Einrichtungen",
        lang: "de",
      },
      {
        _: "Places and facilities related to religion",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "religion.unclassified",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Place of worship (religion not classified)",
        lang: "en",
      },
      {
        _: "Religiiöse Einrichtung (Religion nicht näher bestimmt)",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.unclassified.grave_yard",
    condition: {
      k: "amenity",
      v: "grave_yard",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Graveyard",
        lang: "en",
      },
      {
        _: "Friedhof",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.unclassified.chapel",
    condition: {
      k: "amenity",
      v: "chapel",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Chapel",
        lang: "en",
      },
      {
        _: "Kapelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.christian",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "christian",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Christian facility",
        lang: "en",
      },
      {
        _: "Christliche Einrichtung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.muslim",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "muslim",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Muslim facility",
        lang: "en",
      },
      {
        _: "Muslimische Einrichtung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.jewish",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "jewish",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Jewish facility",
        lang: "en",
      },
      {
        _: "Jüdische Einrichtung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.buddhist",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "buddhist",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Buddhist facility",
        lang: "en",
      },
      {
        _: "Buddhistische Einrichtung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.hindu",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "hindu",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Hindu facility",
        lang: "en",
      },
      {
        _: "Hinduistische Einrichtung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.christian.catholic",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "christian",
    },
    condition_3rd: {
      k: "denomination",
      v: "catholic",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Catholic facility",
        lang: "en",
      },
      {
        _: "Katholische Einrichtung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.christian.orthodox",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "christian",
    },
    condition_3rd: {
      k: "denomination",
      v: "orthodox",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Orthodox facility",
        lang: "en",
      },
      {
        _: "Orthodoxe Einrichtung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.church.protestant",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "christian",
    },
    condition_3rd: {
      k: "denomination",
      v: "protestant",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Protestant Church",
        lang: "en",
      },
      {
        _: "Evangelische Kirche",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.bahai",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "bahai",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Bahai facility",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.jain",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "jain",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Jain facility",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.christian.mormon",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "christian",
    },
    condition_3rd: {
      k: "denomination",
      v: "mormon",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Mormon facility",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.sikh",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "sikh",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Sikh facility",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "religion.taoist",
    condition: {
      k: "amenity",
      v: "place_of_worship",
    },
    condition_2nd: {
      k: "religion",
      v: "taoist",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Taoist facility",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Laden",
        lang: "de",
      },
      {
        _: "Shop",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Orte, an denen man etwas käuflich erwerben kann",
        lang: "de",
      },
      {
        _: "All the places, where you can buy something",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "shop.artists_shop",
    condition: {
      k: "shop",
      v: "artists_shop",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Artists shop",
        lang: "en",
      },
      {
        _: "Künstlerbedarf",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.books",
    condition: {
      k: "shop",
      v: "books",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Bookshop",
        lang: "en",
      },
      {
        _: "Buchhandlung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.mall",
    condition: {
      k: "shop",
      v: "mall",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Shopping Centre/Mall",
        lang: "en",
      },
      {
        _: "Einkaufszentrum",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.clothes",
    condition: {
      k: "shop",
      v: "clothes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Clothes",
        lang: "en",
      },
      {
        _: "Klamottenladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.computer",
    condition: {
      k: "shop",
      v: "computer",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Computershop",
        lang: "en",
      },
      {
        _: "Computerladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.confectioner",
    condition: {
      k: "shop",
      v: "confectioner",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Confectioner",
        lang: "en",
      },
      {
        _: "Konditor",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.print_store",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Print/Xerox Shop",
        lang: "en",
      },
      {
        _: "Copyshop",
        lang: "de",
      },
    ],
    description: {
      _: "A shop where you can print, copy and bind your documents",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.doityourself",
    condition: {
      k: "shop",
      v: "doityourself",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "DIY Store",
        lang: "en",
      },
      {
        _: "Heimwerkermarkt/Baumarkt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.doityourself.hagebau",
    condition: {
      k: "shop",
      v: "doityourself",
    },
    condition_2nd: {
      k: "name",
      v: "Hagebau",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Hagebau",
        lang: "en",
      },
      {
        _: "Hagebau",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.doityourself.hornbach",
    condition: {
      k: "shop",
      v: "doityourself",
    },
    condition_2nd: {
      k: "name",
      v: "Hornbach",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Hornbach",
        lang: "en",
      },
      {
        _: "Hornbach",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.doityourself.obi",
    condition: {
      k: "shop",
      v: "doityourself",
    },
    condition_2nd: {
      k: "name",
      v: "Obi",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "OBI",
        lang: "en",
      },
      {
        _: "OBI",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.doityourself.praktiker",
    condition: {
      k: "shop",
      v: "doityourself",
    },
    condition_2nd: {
      k: "name",
      v: "Praktiker",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Praktiker",
        lang: "en",
      },
      {
        _: "Praktiker",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.doityourself.toom",
    condition: {
      k: "shop",
      v: "doityourself",
    },
    condition_2nd: {
      k: "name",
      v: "toom",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "toom",
        lang: "en",
      },
      {
        _: "toom",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.dry_cleaning",
    condition: {
      k: "shop",
      v: "dry_cleaning",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Dry Cleaning",
        lang: "en",
      },
      {
        _: "Reinigung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.laundry",
    condition: {
      k: "shop",
      v: "laundry",
    },
    scale_min: "1",
    scale_max: "100000",
    title: [
      {
        _: "Laundry",
        lang: "en",
      },
      {
        _: "Waschsalon",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.erotic",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Erotic Store",
        lang: "en",
      },
      {
        _: "Erotikladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.flea_market",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Flea market",
        lang: "en",
      },
      {
        _: "Flohmarkt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.furniture",
    condition: {
      k: "shop",
      v: "furniture",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Furniture",
        lang: "en",
      },
      {
        _: "Enrichtungshaus",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.furniture.ikea",
    condition: {
      k: "shop",
      v: "furniture",
    },
    condition_2nd: {
      k: "name",
      v: "IKEA",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "IKEA",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.furniture.kitchen",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Kitchen store",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.games",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Games Store",
        lang: "en",
      },
      {
        _: "Spieleladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.games.computer",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Computergames",
        lang: "en",
      },
      {
        _: "Computerspieleladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.games.roleplaying",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Roleplaying games",
        lang: "en",
      },
      {
        _: "Rollenspielladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.garden_centre",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Garden centre",
        lang: "en",
      },
      {
        _: "Garten-Center",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.beverages",
    condition: {
      k: "shop",
      v: "beverages",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Drinks cash-and-carry",
        lang: "en",
      },
      {
        _: "Getränkemarkt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.butcher",
    condition: {
      k: "shop",
      v: "butcher",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Butcher",
        lang: "en",
      },
      {
        _: "Metzgerei",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.fish",
    condition: {
      k: "shop",
      v: "fish",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Fish mongers",
        lang: "en",
      },
      {
        _: "Fischladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.fruits",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Fruit",
        lang: "en",
      },
      {
        _: "Obst",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.spices",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Spices",
        lang: "en",
      },
      {
        _: "Gewürzladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.tea",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Tea Shop",
        lang: "en",
      },
      {
        _: "Teeladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vegetables",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Vegetables",
        lang: "en",
      },
      {
        _: "Gemüse",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.department_store",
    condition: {
      k: "shop",
      v: "department_store",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Department store",
        lang: "en",
      },
      {
        _: "Kaufhaus",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.department_store.kaufhof",
    condition: {
      k: "shop",
      v: "department_store",
    },
    condition_2nd: {
      k: "name",
      v: "Kaufhof",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Kaufhof",
        lang: "en",
      },
      {
        _: "Kaufhof",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.kiosk",
    condition: {
      k: "shop",
      v: "kiosk",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Kiosk",
        lang: "en",
      },
      {
        _: "Kiosk",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.lighting",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Lighting",
        lang: "en",
      },
      {
        _: "Beleuchtung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vending_machine",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Vending machine",
        lang: "en",
      },
      {
        _: "Automat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vending_machine.beverages",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    condition_2nd: {
      k: "vending",
      v: "beverages",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Beverages",
        lang: "en",
      },
      {
        _: "Getränkeautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vending_machine.snacks",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Snacks",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shopping.vending_machine.chewing_gum",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    condition_2nd: {
      k: "vending",
      v: "chewing_gum",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Chewing gum",
        lang: "en",
      },
      {
        _: "Kaugummiautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vending_machine.sweets",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    condition_2nd: {
      k: "vending",
      v: "sweets",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Sweets",
        lang: "en",
      },
      {
        _: "Getränkeautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vending_machine.cigarettes",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    condition_2nd: {
      k: "vending",
      v: "cigarettes",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Cigarettes",
        lang: "en",
      },
      {
        _: "Zigarettenautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vending_machine.condoms",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    condition_2nd: {
      k: "vending",
      v: "condoms",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Condoms",
        lang: "en",
      },
      {
        _: "Kondomautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vending_machine.flowers",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    condition_2nd: {
      k: "vending",
      v: "flowers",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Flowers",
        lang: "en",
      },
      {
        _: "Blumenautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vending_machine.stamps",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    condition_2nd: {
      k: "vending",
      v: "stamps",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Stamps",
        lang: "en",
      },
      {
        _: "Briefmarkenautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.excrement_bags",
    condition: {
      k: "amenity",
      v: "vending_machine",
    },
    condition_2nd: {
      k: "vending",
      v: "excrement_bags",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Dog excrement bags",
        lang: "en",
      },
      {
        _: "Hundekot-Tüten",
        lang: "de",
      },
      {
        _: "A Sackerl fürs Kackerl",
        lang: "at",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.market",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Market",
        lang: "en",
      },
      {
        _: "Markt",
        lang: "de",
      },
    ],
    description: [
      {
        lang: "en",
      },
      {
        _: "Ein Platz mit mehreren Verkaufsständen",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "shop.consumer_electronics",
    condition: {
      k: "shop",
      v: "electronics",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Consumer electronics",
        lang: "en",
      },
      {
        _: "Unterhaltungselektronik",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.consumer_electronics.media_markt",
    condition: {
      k: "shop",
      v: "electronics",
    },
    condition_2nd: {
      k: "name",
      v: "Media Markt",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Media Market",
        lang: "en",
      },
      {
        _: "Media Markt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.consumer_electronics.saturn",
    condition: {
      k: "shop",
      v: "electronics",
    },
    condition_2nd: {
      k: "name",
      v: "Saturn",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Saturn",
        lang: "en",
      },
      {
        _: "Saturn",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.media",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Media store",
        lang: "en",
      },
      {
        _: "Medienladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.media.virgin",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Virgin store",
        lang: "en",
      },
      {
        _: "Virgin",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.media.cd_dvd",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "CD/DVD Store",
        lang: "en",
      },
      {
        _: "CD/DVD Laden",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.hifi",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "HiFi Store",
        lang: "en",
      },
      {
        _: "HiFi Laden",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.music",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Music Shop",
        lang: "en",
      },
      {
        _: "Musikladen",
        lang: "de",
      },
    ],
    description: {
      _: "a shop where you can buy musical instruments and accessories",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.perfumery",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Perfumery",
        lang: "en",
      },
      {
        _: "Parfümerie",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.pet_shop",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Pet shop",
        lang: "en",
      },
      {
        _: "Zoohandlung/Tierbedarf",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.print_shop",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Print shop",
        lang: "en",
      },
      {
        _: "Druckerei",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.rental",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Rental",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.rental.event_service",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Event service",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.rental.party_service",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Party service",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.rental.tools",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Tool rental",
        lang: "en",
      },
      {
        _: "Werkzeugverleih",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shopping.rental.video_dvd",
    condition: {
      k: "shop",
      v: "video",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "DVD rental",
      lang: "en",
    },
    description: {
      _: "Videothek",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.sports",
    condition: {
      k: "shop",
      v: "sports",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Sports Shop",
        lang: "en",
      },
      {
        _: "Sportgeschäft",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.sports.diving",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Diving Shop",
        lang: "en",
      },
      {
        _: "Tauchsportgeschäft",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.sports.outdoor.fishing",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Fishing Shop",
        lang: "en",
      },
      {
        _: "Angelzubehör",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.sports.outdoor",
    condition: {
      k: "shop",
      v: "outdoor",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Outdoor Shop",
        lang: "en",
      },
      {
        _: "Outdoor Ausrüstung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.sports.skiing",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Wintersports Shop",
        lang: "en",
      },
      {
        _: "Wintersportzubehör",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.sports.tennis",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Tennis Shop",
        lang: "en",
      },
      {
        _: "Tennis Zubehör",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.sports.arms",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Arms deal",
        lang: "en",
      },
      {
        _: "Waffengeschäft",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.stationery",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Stationery",
        lang: "en",
      },
      {
        _: "Schreibwarenhandlung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.supermarket.aldi",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Aldi",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Aldi",
        lang: "en",
      },
      {
        _: "Aldi Süd",
        lang: "de",
      },
      {
        _: "Hofer",
        lang: "at",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.aldi.nord",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Aldi Nord",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Aldi",
        lang: "en",
      },
      {
        _: "Aldi Nord",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.kaufland",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Kaufland",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Kaufland",
        lang: "en",
      },
      {
        _: "Kaufland",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.lidl",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Lidl",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Lidl",
        lang: "en",
      },
      {
        _: "Lidl",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.marktkauf",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Marktkauf",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Marktkauf",
        lang: "en",
      },
      {
        _: "Marktkauf",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.metro",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Metro",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Metro",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.norma",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Norma",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Norma",
        lang: "en",
      },
      {
        _: "Norma",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.penny",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Penny",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Penny",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.plus",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Plus",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Plus market",
        lang: "en",
      },
      {
        _: "Plus Markt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.real",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Real",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Real",
        lang: "en",
      },
      {
        _: "Real",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.rewe",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "REWE",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "REWE",
        lang: "en",
      },
      {
        _: "REWE",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.supermarket.tengelmann",
    condition: {
      k: "shop",
      v: "supermarket",
    },
    condition_2nd: {
      k: "name",
      v: "Tengelmann",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Tengelmann",
        lang: "en",
      },
      {
        _: "Tengelmann",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "shop.toys",
    condition: {
      k: "shop",
      v: "toys",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Toy Store",
        lang: "en",
      },
      {
        _: "Spielzeugladen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vehicle",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Vehicle",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vehicle.accessories",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Vehicle accessories",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vehicle.caravan",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Caravan dealer",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vehicle.commercial",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Commercial vehicles",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vehicle.cars",
    condition: {
      k: "shop",
      v: "cars",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Car dealer",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vehicle.cars.used",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Used-car dealer",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vehicle.motorcycle",
    condition: {
      k: "shop",
      v: "motorcycle",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Motorcycle dealer",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.vehicle.trailer",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Trailer shop",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "shop.wine",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Wine dealer",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sightseeing.archaeological_site",
    condition: {
      k: "historic",
      v: "archaeological_site",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Archaeological site",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sightseeing.battlefield",
    condition: {
      k: "historic",
      v: "battlefield",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Historic Battlefield",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sightseeing.memorial",
    condition: {
      k: "historic",
      v: "memorial",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Memorial",
        lang: "en",
      },
      {
        _: "Denkmal",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sightseeing.museum",
    condition: {
      k: "tourism",
      v: "museum",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Museum",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sightseeing.ruins",
    condition: {
      k: "historic",
      v: "ruins",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Ruins",
        lang: "en",
      },
      {
        _: "Ruinen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Sportart",
        lang: "de",
      },
      {
        _: "Sport",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Sportplätze und andere sportliche Einrichtungen",
        lang: "de",
      },
      {
        _: "Sports clubs, stadiums, and other sports facilities",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "sport.baseball",
    condition: {
      k: "sport",
      v: "baseball",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Baseball",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.basketball",
    condition: {
      k: "sport",
      v: "basketball",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Basketball",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.cycling",
    condition: {
      k: "sport",
      v: "cycling",
    },
    scale_min: "1",
    scale_max: "100000",
    title: [
      {
        _: "Cycling",
        lang: "en",
      },
      {
        _: "Radsport",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.gym",
    condition: {
      k: "sport",
      v: "gym",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Gym",
        lang: "en",
      },
      {
        _: "Fitness-Studio",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.garden",
    condition: {
      k: "leisure",
      v: "garden",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Garden",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.bowling",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Bowling",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.bowling.10pin",
    condition: {
      k: "sport",
      v: "10pin",
    },
    scale_min: "1",
    scale_max: "100000",
    title: [
      {
        _: "10 pin bowling",
        lang: "en",
      },
      {
        _: "Bowling",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.bowling.9pin",
    condition: {
      k: "sport",
      v: "9pin",
    },
    scale_min: "1",
    scale_max: "100000",
    title: [
      {
        _: "9 pin bowling",
        lang: "en",
      },
      {
        _: "Kegeln",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.centre",
    condition: {
      k: "leisure",
      v: "sports_centre",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Sports centre",
        lang: "en",
      },
      {
        _: "Sportzentrum",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.climbing",
    condition: {
      k: "sport",
      v: "climbing",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Climbing",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.cricket",
    condition: {
      k: "sport",
      v: "cricket",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Cricket",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.dart",
    condition: {
      k: "sport",
      v: "dart",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Dart",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "leisure.fishing",
    condition: {
      k: "leisure",
      v: "fishing",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Fishing",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.flying",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Flying",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.american_football",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "American football",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.gymnastics",
    condition: {
      k: "sport",
      v: "gymnastics",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Gymnastics",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.hockey",
    condition: {
      k: "sport",
      v: "hockey",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Hockey",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.billard",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Billard",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.billard.pool",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Pool billard",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.billard.snooker",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Snooker",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.kite",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Kite",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.motor",
    condition: {
      k: "sport",
      v: "motor",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Motor Sports",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.mountain_bike",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Mountain Bike",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.pitch",
    condition: {
      k: "leisure",
      v: "pitch",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Pitch",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.equestrian",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Equestrian sports",
        lang: "en",
      },
      {
        _: "Reitsport",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.equestrian.polo",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Polo",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.equestrian.jumping",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Show jumping",
        lang: "en",
      },
      {
        _: "Springreiten",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.equestrian.dressage",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Dressage",
        lang: "en",
      },
      {
        _: "Dressurreiten",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.equestrian.eventing",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Eventing",
        lang: "en",
      },
      {
        _: "Vielseitigkeit",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.racquetball",
    condition: {
      k: "sport",
      v: "racquetball",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Racquetball",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.rugby",
    condition: {
      k: "sport",
      v: "rugby",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Rugby",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.sailing",
    condition: {
      k: "sport",
      v: "sailing",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Sailing",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.skating.park",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Skate Park",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.skating",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Skating",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.skating.ice",
    condition: {
      k: "sport",
      v: "skating",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Ice skating",
        lang: "en",
      },
      {
        _: "Schlittschuhlaufen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.skating.skateboard",
    condition: {
      k: "sport",
      v: "skateboard",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Skateboarding",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.skiing",
    condition: {
      k: "sport",
      v: "skiing",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Skiing",
        lang: "en",
      },
      {
        _: "Skisport",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.skiing.jumping",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Nordic jumping",
        lang: "en",
      },
      {
        _: "Skispringen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.skiing.cross_country",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Cross country",
        lang: "en",
      },
      {
        _: "Langlauf",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.skiing.alpine",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Alpine jumping",
        lang: "en",
      },
      {
        _: "Alpinski",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.soccer",
    condition: {
      k: "sport",
      v: "soccer",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Soccerfield",
        lang: "en",
      },
      {
        _: "Fußballplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.squash",
    condition: {
      k: "sport",
      v: "squash",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Squash",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.stadium",
    condition: {
      k: "leisure",
      v: "stadium",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Stadium",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.swimming",
    condition: [
      {
        k: "leisure",
        v: "swimming_pool",
      },
      {
        k: "sport",
        v: "swimming",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Swimming",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.table_tennis",
    condition: {
      k: "sport",
      v: "table_tennis",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Table Tennis",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.tennis",
    condition: {
      k: "sport",
      v: "tennis",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Tennis",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "sport.volleyball",
    condition: {
      k: "sport",
      v: "volleyball",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Volleyball",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Öffentliches Transportmittel",
        lang: "de",
      },
      {
        _: "Public Transport",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Flughäfen und öffentliche Transportmittel",
        lang: "de",
      },
      {
        _: "Airports and public transportation",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "transport.airport",
    condition: {
      k: "aeroway",
      v: "airport",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Airport",
        lang: "en",
      },
      {
        _: "Flughafen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.airport.helipad",
    condition: {
      k: "aeroway",
      v: "helipad",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Helipad",
        lang: "en",
      },
      {
        _: "Hubschrauberlandeplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.airport.terminal",
    condition: {
      k: "aeroway",
      v: "Terminal",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Terminal",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.bus",
    condition: {
      k: "highway",
      v: "bus_stop",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Bus Stop",
        lang: "en",
      },
      {
        _: "Bushaltestelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.ferry",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Ferry",
        lang: "en",
      },
      {
        _: "Fähre",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.ferry.car",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Car Ferry",
        lang: "en",
      },
      {
        _: "Autofähre",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.ferry.pedestrian",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Pedestrian Ferry",
        lang: "en",
      },
      {
        _: "Fußgänger Fähre",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.funicular_station",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Funicular station",
        lang: "en",
      },
      {
        _: "Seilbahnstation",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "dynamic",
    v: "nautical.ais",
    scale_min: "1",
    scale_max: "500000",
    title: [
      {
        _: "AIS data",
        lang: "en",
      },
      {
        _: "AIS Daten",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "nautical.harbour",
    condition: {
      k: "waterway",
      v: "harbour",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Harbour",
        lang: "en",
      },
      {
        _: "Hafen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.railway_station",
    condition: {
      k: "railway",
      v: "station",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Railway Station",
        lang: "en",
      },
      {
        _: "Bahnhof",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.suburban_train",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Suburban train station",
        lang: "en",
      },
      {
        _: "S-Bahnhof",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.taxi",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Taxi Stand",
        lang: "en",
      },
      {
        _: "Taxistand",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.ticket-machine",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Ticket machine",
        lang: "en",
      },
      {
        _: "Fahrkartenautomat",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.tram_stop",
    condition: {
      k: "railway",
      v: "tram_stop",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Tram Stop",
        lang: "en",
      },
      {
        _: "Trambahn Haltestelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "transport.subway",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Subway Station",
        lang: "en",
      },
      {
        _: "U-Bahnhof",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "unknown",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Unbekannt",
        lang: "de",
      },
      {
        _: "Unknown",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Nicht zugewiesener POI",
        lang: "de",
      },
      {
        _: "Unassigned POI",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "vehicle",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "Fahrzeug",
        lang: "de",
      },
      {
        _: "Vehicle",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Dinge für Selbstfahrer, z.B. Tankstellen oder Parkplätze",
        lang: "de",
      },
      {
        _: "Facilites for drivers, like gas stations or parking places",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "vehicle.rental",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Vehicle Rental",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.rental.bicycle",
    condition: {
      k: "amenity",
      v: "bicycle_rental",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Bicycle rental",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.rental.car",
    condition: {
      k: "amenity",
      v: "car_rental",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Car rental",
        lang: "en",
      },
      {
        _: "Autovermietung",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.rental.car.avis",
    condition: {
      k: "amenity",
      v: "car_rental",
    },
    condition_2nd: [
      {
        k: "name",
        v: "Avis",
      },
      {
        k: "operator",
        v: "Avis",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "AVIS",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.rental.car.europcar",
    condition: {
      k: "amenity",
      v: "car_rental",
    },
    condition_2nd: [
      {
        k: "name",
        v: "Europcar",
      },
      {
        k: "operator",
        v: "Europcar",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Europcar",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.rental.car.hertz",
    condition: {
      k: "amenity",
      v: "car_rental",
    },
    condition_2nd: [
      {
        k: "name",
        v: "Hertz",
      },
      {
        k: "operator",
        v: "Hertz",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Hertz",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.rental.car.sixt",
    condition: {
      k: "amenity",
      v: "car_rental",
    },
    condition_2nd: [
      {
        k: "name",
        v: "Sixt",
      },
      {
        k: "operator",
        v: "Sixt",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Sixt",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.rental.car.budget",
    condition: {
      k: "amenity",
      v: "car_rental",
    },
    condition_2nd: [
      {
        k: "name",
        v: "Budget",
      },
      {
        k: "operator",
        v: "Budget",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Budget",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.car_sharing",
    condition: {
      k: "amenity",
      v: "car_sharing",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Car sharing",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "service.emergency_phone",
    condition: {
      k: "amenity",
      v: "emergency_phone",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Emergency Phone",
        lang: "en",
      },
      {
        _: "Notrufsäule",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.exit",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Exit",
        lang: "en",
      },
      {
        _: "Ausfahrt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.fuel.agip",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "Agip",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Agip",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.aral",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "Aral",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Aral",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.bft",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "bft",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "bft",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.bp",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "BP",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "BP",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.elf",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "ELF",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "ELF",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.esso",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "Esso",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Esso",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.jet",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "Jet",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Jet",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.omv",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "OMV",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "OMV",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.shell",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "Shell",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Shell",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.texaco",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "Texaco",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Texaco",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.fuel.total",
    condition: {
      k: "amenity",
      v: "fuel",
    },
    condition_2nd: {
      k: "name",
      v: "Total",
    },
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Total",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "vehicle.parking.bicycle",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Bicycle parking",
        lang: "en",
      },
      {
        _: "Fahrradparkplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.car",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Car Parking",
        lang: "en",
      },
      {
        _: "Autoparkplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.multi-storey",
    condition: {
      k: "amenity",
      v: "parking",
    },
    condition_2nd: {
      k: "parking",
      v: "multi-storey",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Multistorey parking",
        lang: "en",
      },
      {
        _: "Parkhaus",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.underground",
    condition: {
      k: "amenity",
      v: "parking",
    },
    condition_2nd: {
      k: "parking",
      v: "underground",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Underground parking",
        lang: "en",
      },
      {
        _: "Tiefgarage",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.handicapped",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Handicapped Parking",
        lang: "en",
      },
      {
        _: "Behindertenparkplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.hiking",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Parking site for hikers",
        lang: "en",
      },
      {
        _: "Wandererparkplatz",
        lang: "de",
      },
      {
        _: "Trailhead parking place",
        lang: "us",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.motorbike",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Motorbike parking",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.park_ride",
    condition: {
      k: "amenity",
      v: "parking",
    },
    condition_2nd: {
      k: "parking",
      v: "park_and_ride",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Park and Ride",
        lang: "en",
      },
      {
        _: "P+R Parkplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.restarea",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Rest area",
        lang: "en",
      },
      {
        _: "Rastplatz",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.parking.restarea_toilets",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Rest area with Toilet",
        lang: "en",
      },
      {
        _: "Rastplatz mit Toilette",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.repair_shop",
    condition: {
      k: "shop",
      v: "car_repair",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Repair shop",
        lang: "en",
      },
      {
        _: "Werkstatt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.services",
    condition: {
      k: "highway",
      v: "services",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Service area",
        lang: "en",
      },
      {
        _: "Raststätte",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "vehicle.toll_booth",
    condition: {
      k: "highway",
      v: "toll_booth",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Toll booth",
        lang: "en",
      },
      {
        _: "Mautstation",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.flag",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Flag ",
        lang: "en",
      },
      {
        _: "Flagge ",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.flag.blue",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Blue flag",
        lang: "en",
      },
      {
        _: "blaue Flagge",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.flag.green",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Green flag",
        lang: "en",
      },
      {
        _: "grüne Flagge",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.flag.orange",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Orange flag",
        lang: "en",
      },
      {
        _: "orange Flagge",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.flag.red",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Red flag",
        lang: "en",
      },
      {
        _: "rote Flagge",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.flag.yellow",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Yellow flag",
        lang: "en",
      },
      {
        _: "Gelbe Flagge",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.pin",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Pin",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.pin.blue",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Blue pin",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.pin.green",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Green pin",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.pin.orange",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Orange pin",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.pin.red",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Red pin",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.pin.yellow",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Yellow pin",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.route",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Routenpunkt",
        lang: "de",
      },
      {
        _: "Routepoint",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Wegpunkt, um die Punkte der aktuellen Route zu markieren",
        lang: "de",
      },
      {
        _: "Generic waypoint to mark the points of the current route",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.destination",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Destination",
        lang: "en",
      },
      {
        _: "Ziel",
        lang: "de",
      },
    ],
    description: [
      {
        _: "You have reached your destination.",
        lang: "en",
      },
      {
        _: "Sie haben Ihr Ziel erreicht.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.left",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Turn left",
        lang: "en",
      },
      {
        _: "Links abbiegen",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Turn left here",
        lang: "en",
      },
      {
        _: "Biegen Sie links ab.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.left.exit",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Take the exit",
        lang: "en",
      },
      {
        _: "Ausfahrt links",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Leave the motorway here",
        lang: "en",
      },
      {
        _: "Verlassen Sie die Autobahn.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.left.fork",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Fork left",
        lang: "en",
      },
      {
        _: "Links halten",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Fork left here",
        lang: "en",
      },
      {
        _: "Hier bitte links halten",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.left.hard",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Hard left",
        lang: "en",
      },
      {
        _: "Scharf links",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Turn hard left here",
        lang: "en",
      },
      {
        _: "Biegen Sie hier scharf links ab.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.left.merge",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Merge left",
        lang: "en",
      },
      {
        _: "Auffahrt links",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Merge left here.",
        lang: "en",
      },
      {
        _: "Nehmen Sie die Auffahrt links.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.left.soft",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Soft left",
        lang: "en",
      },
      {
        _: "Leicht links",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Turn left softly",
        lang: "en",
      },
      {
        _: "Biegen Sie hier leicht nach links ab.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.left.uturn",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Uturn left",
        lang: "en",
      },
      {
        _: "links wenden",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Please do a U-turn here",
        lang: "en",
      },
      {
        _: "Bitte wenden Sie hier.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.right",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Turn right",
        lang: "en",
      },
      {
        _: "Rechts abbiegen",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Turn right here",
        lang: "en",
      },
      {
        _: "Biegen Sie rechts ab.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.right.exit",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Take the exit right",
        lang: "en",
      },
      {
        _: "Ausfahrt rechts",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Leave the motorway here",
        lang: "en",
      },
      {
        _: "Verlassen Sie die Autobahn.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.right.fork",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Fork right",
        lang: "en",
      },
      {
        _: "Rechts halten",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Fork right here",
        lang: "en",
      },
      {
        _: "Hier bitte rechts halten",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.right.hard",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Hard right",
        lang: "en",
      },
      {
        _: "Scharf rechts",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Turn hard right here",
        lang: "en",
      },
      {
        _: "Biegen Sie hier scharf rechts ab.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.right.merge",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Merge right",
        lang: "en",
      },
      {
        _: "Auffahrt rechts",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Merge right here",
        lang: "en",
      },
      {
        _: "Nehmen Sie die Auffahrt rechts.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.right.soft",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Soft right",
        lang: "en",
      },
      {
        _: "Leicht rechts",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Turn right softly",
        lang: "en",
      },
      {
        _: "Biegen Sie hier leicht nach rechts ab.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.right.uturn",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Uturn right",
        lang: "en",
      },
      {
        _: "Rechts wenden",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Please do a U-turn here",
        lang: "en",
      },
      {
        _: "Bitte wenden Sie hier.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.route.straight",
    scale_min: "1",
    scale_max: "5000000",
    title: [
      {
        _: "Straight on",
        lang: "en",
      },
      {
        _: "Geradeaus",
        lang: "de",
      },
    ],
    description: [
      {
        _: "Go straight on",
        lang: "en",
      },
      {
        _: "Fahren Sie geradeaus.",
        lang: "de",
      },
    ],
  },
  {
    k: "poi",
    v: "waypoint.wpt1",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 1",
        lang: "en",
      },
      {
        _: "Wegpunkt 1",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wpt2",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 2",
        lang: "en",
      },
      {
        _: "Wegpunkt 2",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wpt3",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 3",
        lang: "en",
      },
      {
        _: "Wegpunkt 3",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wpt4",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 4",
        lang: "en",
      },
      {
        _: "Wegpunkt 4",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wpt5",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 5",
        lang: "en",
      },
      {
        _: "Wegpunkt 5",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wpt6",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 6",
        lang: "en",
      },
      {
        _: "Wegpunkt 6",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wpt7",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 7",
        lang: "en",
      },
      {
        _: "Wegpunkt 7",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wpt8",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 8",
        lang: "en",
      },
      {
        _: "Wegpunkt 8",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wpt9",
    scale_min: "1",
    scale_max: "1500000",
    title: [
      {
        _: "Waypoint 9",
        lang: "en",
      },
      {
        _: "Wegpunkt 9",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wptblue",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Blue",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wptgreen",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Green",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wptorange",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Orange",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wptred",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Red",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "waypoint.wptyellow",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Yellow",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "wlan",
    scale_min: "1",
    scale_max: "25000",
    title: [
      {
        _: "WLAN",
        lang: "de",
      },
      {
        _: "WLAN",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Accesspoints und andere WLAN-Einrichtungen (Kismet)",
        lang: "de",
      },
      {
        _: "WiFi-related points (Kismet)",
        lang: "en",
      },
    ],
  },
  {
    k: "poi",
    v: "wlan.closed",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Closed WLAN",
        lang: "en",
      },
      {
        _: "WLAN geschlossen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "wlan.closed.wep",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "WEP encrypted WLAN",
        lang: "en",
      },
      {
        _: "WLAN WEP verschlüsselt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "wlan.closed.wpa",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "WPA encrypted WLAN",
        lang: "en",
      },
      {
        _: "WLAN WPA verschlüsselt",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "wlan.open",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Open WLAN",
        lang: "en",
      },
      {
        _: "WLAN offen",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "wlan.nonfree",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "WLAN requiring fee or registration",
        lang: "en",
      },
      {
        _: "registrierungs- oder kostenpflichtiges WLAN",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "wlan.nonfree.eurospot",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Swisscom Eurospot",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "wlan.nonfree.fon",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "FON Accesspoint",
      lang: "en",
    },
    description: {
      _: "http://www.fon.com",
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "wlan.nonfree.ganag",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Ganag",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "poi",
    v: "wlan.nonfree.t-mobile",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "T-Mobile",
      lang: "en",
    },
    description: {
      lang: "en",
    },
    restricted: "brand",
  },
  {
    k: "rendering",
    v: "transport.bridge",
    condition: [
      {
        k: "bridge",
        v: "yes",
      },
      {
        k: "type",
        v: "bridge",
      },
      {
        k: "class",
        v: "bridge",
      },
    ],
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Bridge",
        lang: "en",
      },
      {
        _: "Brücke",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.caution",
    condition: {
      k: "class",
      v: "caution",
    },
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Caution",
        lang: "en",
      },
      {
        _: "Gefahrenstelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.construction",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Construction site",
        lang: "en",
      },
      {
        _: "Baustelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.danger",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Dangerous area",
        lang: "en",
      },
      {
        _: "Gefahrenstelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "misc.deprecated",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Deprecated",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "misc.door",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Door",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "poi",
    v: "misc.landmark.farm",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Farm",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.landuse.forest",
    condition: {
      k: "landuse",
      v: "forest",
    },
    scale_min: "1",
    scale_max: "500000",
    title: [
      {
        _: "Forest",
        lang: "en",
      },
      {
        _: "Wald",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Forest covering an area",
        lang: "en",
      },
      {
        _: "Waldbedeckung fuer ein Gebiet",
        lang: "de",
      },
    ],
  },
  {
    k: "rendering",
    v: "rendering.landuse.cemetery",
    condition: {
      k: "landuse",
      v: "cemetery",
    },
    scale_min: "1",
    scale_max: "500000",
    title: [
      {
        _: "Cemetery",
        lang: "en",
      },
      {
        _: "Friedhof",
        lang: "en",
      },
    ],
    description: [
      {
        _: "Cemetery covering an area",
        lang: "en",
      },
      {
        _: "Friedhof Gebiet",
        lang: "de",
      },
    ],
  },
  {
    k: "general",
    v: "misc.lock_closed",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Locked",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "misc.lock_open",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Unlocked",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "misc.no_icon",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "No icon",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "misc.no_smoking",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "No Smoking",
        lang: "en",
      },
      {
        _: "Rauchverbot",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "misc.proposed",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "proposed",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "misc.tag_",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Tag",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Rendering",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.beach",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Beach",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.cliff",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Cliff",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.cliff2",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Cliff 2",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.quarry",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Quarry",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.quarry2",
    scale_min: "1",
    scale_max: "100000",
    title: {
      _: "Quarry 2",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.rail_preserved",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.motorway_shield",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.motorway_shield1",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.motorway_shield2",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.motorway_shield3",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.motorway_shield4",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.motorway_shield5",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.motorway_shield6",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.primary_shield1",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.primary_shield2",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.primary_shield3",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.primary_shield4",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.primary_shield5",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.primary_shield6",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.primary_shield7",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.primary_shield8",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.secondary_shield1",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.secondary_shield2",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.secondary_shield3",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.secondary_shield4",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.secondary_shield5",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.secondary_shield6",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.secondary_shield7",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.secondary_shield8",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.tertiary_shield1",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.tertiary_shield2",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.tertiary_shield3",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.tertiary_shield4",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.tertiary_shield5",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.tertiary_shield6",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.tertiary_shield7",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.tertiary_shield8",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.trunk_shield1",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.trunk_shield2",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.trunk_shield3",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.trunk_shield4",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.trunk_shield5",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.trunk_shield6",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.trunk_shield7",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.shield.trunk_shield8",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.station_small",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.track.arrow",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.track.arrow_back",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.track.mini_round",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.track.rail",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "rendering.track.station_small",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.crossing",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.crossing_small",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.bikestop",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.bikestop-simple",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.bollard",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.bollard-bw",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.bollard-simple",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.dead_end",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Dead End",
        lang: "en",
      },
      {
        _: "Sackgasse",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.incline",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.motorbike",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.parking",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.play_street",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        lang: "en",
      },
      {
        _: "Spielstraße",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.right_of_way",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.road_works",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Road Works",
        lang: "en",
      },
      {
        _: "Baustelle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.roundabout_left",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.roundabout_right",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.5",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 5",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.10",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 10",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.20",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 20",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.30",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 30",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.40",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 40",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.50",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 50",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.60",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 60",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.70",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 70",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.80",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 80",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.100",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 100",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed.120",
    scale_min: "1",
    scale_max: "50000",
    title: {
      _: "Speed limit 120",
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.speed_trap",
    scale_min: "1",
    scale_max: "50000",
    title: [
      {
        _: "Speed Trap",
        lang: "en",
      },
      {
        _: "Radarfalle",
        lang: "de",
      },
    ],
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.stop",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.traffic-light",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "general",
    v: "vehicle.restriction.traffic_jam",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.shield.motorway_shield",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.shield.motorway_shield2",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.shield.motorway_shield3",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.tunnel",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.turning_circle",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.viaduct",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.zebra_crossing",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "transport.track.arrow",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "transport.track.arrow_back",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "transport.track.rail",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "other",
    v: "misc.camera",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.gate",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.cattle_grid",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "vehicle.ford",
    scale_min: "1",
    scale_max: "50000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "transport.railway.turntable",
    condition: {
      k: "railway",
      v: "turntable",
    },
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
  {
    k: "rendering",
    v: "transport.track",
    scale_min: "1",
    scale_max: "100000",
    title: {
      lang: "en",
    },
    description: {
      lang: "en",
    },
  },
];
