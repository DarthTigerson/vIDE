// Plausible project, team and product words used for realistic aliases.
// Lowercase, no dashes. Deduplicated at load time.

const RAW = `
atlas beacon harbor ledger orbit platform data core web api portal studio relay
anchor apex arbor arch arrow aspen aurora avenue axis badge baker banner barley basin bastion bay bazaar
beam bear bell bench birch bishop blade bloom bluff board bolt bond border bow bracket branch brass bridge
brook buffer bundle cabin cable cache cadet cairn canal candle canopy canvas canyon cape captain cargo carbon
carousel castle cedar cellar center chain chalk channel chapel charter chart chase cherry chime cipher circle
citadel clarity clay cliff clock cloud clover coast cobalt cobble cocoa code collar colony column comet compass
concord condor copper coral cork corner cosmos cottage cove craft crane crater creek crest crimson crown crystal
cube current curtain cypress dagger dahlia dale dawn delta den depot desert dial diamond dock dolphin dome
dove drift drum dune dusk eagle earth echo eclipse edge elder elm ember emerald engine envoy epoch equinox
estate ether evergreen falcon fathom feather fern ferry fiber field finch fir fjord flame flint flora flow
focus forest forge fork fort fountain fox frame freight frontier frost galaxy garden garnet gate gateway
gazelle gear gem geyser glacier glade glen globe glow granite grape graph grove guard guide gulf hamlet
hammer harvest haven hawk hazel heath hedge helix helm heron hickory highland hill hollow horizon hub
hyacinth iceberg indigo inlet iris iron island ivory ivy jade jasmine jetty jewel journey juniper keel
kernel kestrel key kiln kite knoll lagoon lake lantern larch lark latch lattice laurel lava lawn leaf
ledge legacy lens levee lighthouse lilac lily linden link lion loft lotus lumen lunar lynx magnet
magnolia mantle maple marble marina marsh mason meadow mercury mesa meteor milestone mill mint mirage
mist monarch moon moss mountain mulberry nebula needle nest nexus nimbus noble north nova oak oasis
ocean olive onyx opal orchard orchid osprey otter oxide paddle palette palm panel panther paper parcel
parlor pasture path pavilion peak pearl pebble pelican pepper petal phoenix piazza pier pilot pine
pioneer pivot plaza plume pointer polar pond poplar port prairie prism proxy pulse puma quarry quartz
quest quill rail rain rampart range rapids raven reach reef ridge ripple river rock root rose rowan
ruby saddle saffron sage sail sand sapphire savanna scout sequoia shadow shelf shore signal silver
sketch skyline slate sleet slope snow solstice sparrow spectrum sphere spire spring spruce square
stable stag star station steel stone storm stream summit sun sundial swan sycamore tableau talon
tango tarn temple terrace thistle thorn thunder tidal tide timber topaz torch tower trail transit
trellis tribe trident tulip tundra tunnel turbine twilight umbra union valley vanguard vault velvet
venture vertex vessel vista voyage walnut wander warden watch wave weaver willow wind window wing
winter wolf wren yarrow yonder zenith zephyr zinc
account admin alert analytics archive audit auth backend backup batch billing blog board booking
broker build bus calendar campaign catalog chat checkout client cluster command config console
content contact control crm customer dashboard deploy design desk directory discovery docs domain
driver edge email engagement event export feed files finance flags forms frontend funnel gallery
gateway geo graphql grid growth help identity images import index infra ingest insights inventory
invoice jobs journal kiosk labs launch layout leads library licensing loader locale logistics
logs mailer maps market media members merchant messaging metrics mobile monitor navigator network
news notes notify offers onboarding orders organizer outbox pages partner payments people pipeline
planner playbook plugins policy pricing profile projects promo publisher queue quotes ratings
reader records registry release renderer reports research reviews roster routes rules sales
scheduler schema search security sender services session settings sheets shipping shop sidebar
signup site sitemap snapshot social sources spaces sprint staging storage store stories subscriptions
support surveys sync tagging tasks teams templates tenants theme tickets timeline tools tracker
traffic training translate trends uploads usage users vendor viewer vouchers wallet warehouse
widgets wiki workbench workflow workspace
alpha bravo charlie foxtrot hotel juliet kilo lima mike oscar papa quebec romeo sierra uniform victor
whiskey yankee zulu
aegis agora albatross alchemy almanac altitude amber ambit amethyst anthem aperture aquarius arcade
archer ardent argon aria armada artisan ascent aspect asset astral atrium augur avalon aviary azure
balsam bamboo banyan barrel baron bayou beacon bellwether benchmark birdie blossom bonsai boreal
borealis boulder bouquet bounty brevity brigade brilliant bristle bronze bulwark burrow butte
cadence calypso camber cameo caravan cardinal carnelian cascade catalyst cavern centaur cerulean
chamber champion chestnut chroma cinder cinnamon clarion clipper cobalt cogent compact conduit
constellation coppice cormorant corona cortex coyote cradle crescent crossing crucible cumulus
cyan cygnus daffodil dapple daybreak dazzle decade dewdrop diadem dingo discus dragonfly drizzle
dynamo eaglet ebony eddy elixir elysium empire enclave endeavor enigma ensign ephemera equator
ermine espresso estuary evolve exodus fable fairway fandango fawn fennel fidelity firefly firth
flagship flare fleet flicker floret flotilla flux foothill foxglove fresco frigate fulcrum
gadget galleon gallop gambit gantry gardenia gaslight gentian gilded gingham glimmer glyph
goldfinch gondola gossamer graceful gradient gravity greenhouse griffin gull gust gypsum
halcyon halo hangar harbinger harmony hearth hemlock herald heritage hibiscus hinge hive
homestead honeycomb hopper hornet horseshoe hourglass hummingbird hydra icicle ignite imprint
impulse ingot insight intrepid isthmus jaguar jamboree jubilee junction jupiter kaleidoscope
kayak kelp keystone kingfisher kodiak koi kudos labyrinth lacewing lancer landmark larkspur
latitude lavender legend lemon lexicon lilt limestone lincoln linnet lodestar longitude lookout
lullaby lupine lustre macaw madrigal maelstrom mahogany mallard mammoth mandarin mangrove
manor mariner marigold marlin matrix maverick mayfly meander medley melody meridian mesquite
metro midnight mimosa minnow mirth mocha momentum mongoose monsoon mosaic motif mustang myrtle
narwhal nautilus navigate nectar neptune nettle nightingale nomad nutmeg oatmeal obsidian
octave odyssey olympus omega onward opus oracle orion oriole outpost oyster paladin pampas
paragon parchment parrot patchwork pavement peacock pegasus pendulum peninsula peony periwinkle
persimmon petrel pewter pheasant pinnacle pinwheel pistachio plover plume pomegranate porcelain
portico prairie primrose promenade prospect pyramid quasar quail quetzal quiver radiant
ragtime rainbow rambler raspberry rebel redwood refuge regatta relic resolve rhapsody rhythm
ribbon rivet robin rosemary rotunda rudder rustic sable sailor salmon sanctuary sandpiper
sandstone sanguine sapling sardine satchel saturn scarlet scepter schooner scribe seabird
sentinel serenade serene sextant shamrock shepherd sherpa shimmer shuttle sienna sierra
silhouette sinew skipper skylark sloop snowdrop solace sonnet sorrel soundwave spark sparkle
spindle spinnaker spiral splendor sprout squire stallion starling steppe sterling stratus
sunbeam sundown sunflower sunrise sunset surf swallow sweetgum symphony tamarack tangerine
tapestry tartan teal tempo tern thicket thimble thrush thyme tiger tinder tomorrow topiary
tortoise totem tradewind tranquil trapeze treasure trillium trinity triton trophy trout
trumpet tuxedo twine typhoon ultra umber unity upland utopia valiant vector velocity
verdant verge vermilion vesper viaduct victory vigil villa vine violet virtue vivid
volcano vortex wagon wanderer waterfall waypoint wheat whisper whistle wildflower windmill
wisteria wonder woodland yacht yew zeal zeppelin zircon
`

export const WORDS: readonly string[] = [...new Set(RAW.split(/\s+/).filter((w) => /^[a-z]{3,}$/.test(w)))]
