"""Builds front_offices.csv: one row per team per draft year 2010-2027.

Data below was written from memory and then checked against:
- PFR executives index (GM/top exec seasons): https://www.pro-football-reference.com/executives/
- nflverse games.csv (head coach of each game, 2010-2025 seasons)
- Wikipedia 2026 NFL season (2026 coaching and front office changes)
- person pages and news items cited per row.
Run: python3 -I build_front_offices.py raw/nflverse_games.csv
"""
import csv
import collections
import os
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "front_offices.csv")
YEARS = range(2010, 2028)

PFR = "https://www.pro-football-reference.com/executives/"
NFLV = "https://github.com/nflverse/nfldata/blob/master/data/games.csv"
W26 = "https://en.wikipedia.org/wiki/2026_NFL_season"
NBC26 = "https://www.nbcwashington.com/news/sports/nfl/tracking-new-nfl-head-coach-front-office-hires-2026-offseason/"

# GM tenures: (first_draft, last_draft, name, gm_start, gm_prev, checked_prev_url or None)
# gm_start = first draft run in the job. HC tenures: (first_draft, last_draft, name, hc_start, hc_prev, url)
# hc_start = first season as head coach of that team (interim stints count).
G = {}
H = {}

G["ARI"] = [
    (2010, 2012, "Rod Graves", 2003, "ARI VP of football operations (ex-CHI director of player personnel)", "https://en.wikipedia.org/wiki/Rod_Graves"),
    (2013, 2022, "Steve Keim", 2013, "ARI VP of player personnel", None),
    (2023, 2027, "Monti Ossenfort", 2023, "TEN director of player personnel", None),
]
H["ARI"] = [
    (2010, 2012, "Ken Whisenhunt", 2007, "PIT offensive coordinator", None),
    (2013, 2017, "Bruce Arians", 2013, "IND offensive coordinator (interim HC 2012)", None),
    (2018, 2018, "Steve Wilks", 2018, "CAR defensive coordinator", None),
    (2019, 2022, "Kliff Kingsbury", 2019, "Texas Tech head coach (briefly USC OC)", None),
    (2023, 2025, "Jonathan Gannon", 2023, "PHI defensive coordinator", None),
    (2026, 2027, "Mike LaFleur", 2026, "LA offensive coordinator", NBC26),
]
G["ATL"] = [
    (2010, 2020, "Thomas Dimitroff", 2008, "NE director of college scouting", None),
    (2021, 2025, "Terry Fontenot", 2021, "NO assistant GM / VP of pro personnel", None),
    (2026, 2027, "Ian Cunningham", 2026, "CHI assistant GM", NBC26),
]
H["ATL"] = [
    (2010, 2014, "Mike Smith", 2008, "JAX defensive coordinator", None),
    (2015, 2020, "Dan Quinn", 2015, "SEA defensive coordinator", None),
    (2021, 2023, "Arthur Smith", 2021, "TEN offensive coordinator", None),
    (2024, 2025, "Raheem Morris", 2024, "LA defensive coordinator", None),
    (2026, 2027, "Kevin Stefanski", 2026, "CLE head coach", NBC26),
]
G["BAL"] = [
    (2010, 2018, "Ozzie Newsome", 2002, "BAL VP of player personnel", None),
    (2019, 2027, "Eric DeCosta", 2019, "BAL assistant GM", None),
]
H["BAL"] = [
    (2010, 2025, "John Harbaugh", 2008, "PHI defensive backs coach", None),
    (2026, 2027, "Jesse Minter", 2026, "LAC defensive coordinator", NBC26),
]
G["BUF"] = [
    (2010, 2013, "Buddy Nix", 2010, "BUF national scout (ex-SD assistant GM)", "https://en.wikipedia.org/wiki/Buddy_Nix"),
    (2014, 2017, "Doug Whaley", 2014, "BUF assistant GM", None),
    (2018, 2027, "Brandon Beane", 2018, "CAR assistant GM", None),
]
H["BUF"] = [
    (2010, 2012, "Chan Gailey", 2010, "KC offensive coordinator (2008)", None),
    (2013, 2014, "Doug Marrone", 2013, "Syracuse head coach", None),
    (2015, 2016, "Rex Ryan", 2015, "NYJ head coach", None),
    (2017, 2025, "Sean McDermott", 2017, "CAR defensive coordinator", None),
    (2026, 2027, "Joe Brady", 2026, "BUF offensive coordinator", NBC26),
]
G["CAR"] = [
    (2010, 2012, "Marty Hurney", 2002, "CAR director of football operations", None),
    (2013, 2017, "Dave Gettleman", 2013, "NYG senior pro personnel analyst", None),
    (2018, 2020, "Marty Hurney", 2018, "former CAR GM (2002-12); interim GM from July 2017", None),
    (2021, 2023, "Scott Fitterer", 2021, "SEA VP of football operations", None),
    (2024, 2027, "Dan Morgan", 2024, "CAR assistant GM", None),
]
H["CAR"] = [
    (2010, 2010, "John Fox", 2002, "NYG defensive coordinator", None),
    (2011, 2019, "Ron Rivera", 2011, "SD defensive coordinator", None),
    (2020, 2022, "Matt Rhule", 2020, "Baylor head coach", None),
    (2023, 2023, "Frank Reich", 2023, "out of football (ex-IND head coach)", None),
    (2024, 2027, "Dave Canales", 2024, "TB offensive coordinator", None),
]
G["CHI"] = [
    (2010, 2011, "Jerry Angelo", 2001, "TB director of player personnel", None),
    (2012, 2014, "Phil Emery", 2012, "KC director of college scouting", None),
    (2015, 2021, "Ryan Pace", 2015, "NO director of player personnel", None),
    (2022, 2027, "Ryan Poles", 2022, "KC executive director of player personnel", None),
]
H["CHI"] = [
    (2010, 2012, "Lovie Smith", 2004, "STL defensive coordinator", None),
    (2013, 2014, "Marc Trestman", 2013, "Montreal Alouettes (CFL) head coach", None),
    (2015, 2017, "John Fox", 2015, "DEN head coach", None),
    (2018, 2021, "Matt Nagy", 2018, "KC offensive coordinator", None),
    (2022, 2024, "Matt Eberflus", 2022, "IND defensive coordinator", None),
    (2025, 2027, "Ben Johnson", 2025, "DET offensive coordinator", None),
]
G["CIN"] = [
    (2010, 2027, "Mike Brown", 1991, "CIN assistant GM (under Paul Brown)", None),
]
H["CIN"] = [
    (2010, 2018, "Marvin Lewis", 2003, "WAS defensive coordinator", None),
    (2019, 2027, "Zac Taylor", 2019, "LA quarterbacks coach", None),
]
G["CLE"] = [
    (2010, 2012, "Tom Heckert", 2010, "PHI GM", None),
    (2013, 2013, "Michael Lombardi", 2013, "NFL Network analyst (ex-OAK personnel executive)", None),
    (2014, 2015, "Ray Farmer", 2014, "CLE assistant GM", None),
    (2016, 2017, "Sashi Brown", 2016, "CLE EVP and general counsel", None),
    (2018, 2019, "John Dorsey", 2018, "former KC GM (fired June 2017)", None),
    (2020, 2027, "Andrew Berry", 2020, "PHI VP of football operations", None),
]
H["CLE"] = [
    (2010, 2010, "Eric Mangini", 2009, "NYJ head coach", None),
    (2011, 2012, "Pat Shurmur", 2011, "STL offensive coordinator", None),
    (2013, 2013, "Rob Chudzinski", 2013, "CAR offensive coordinator", None),
    (2014, 2015, "Mike Pettine", 2014, "BUF defensive coordinator", None),
    (2016, 2018, "Hue Jackson", 2016, "CIN offensive coordinator", None),
    (2019, 2019, "Freddie Kitchens", 2019, "CLE offensive coordinator", None),
    (2020, 2025, "Kevin Stefanski", 2020, "MIN offensive coordinator", None),
    (2026, 2027, "Todd Monken", 2026, "BAL offensive coordinator", NBC26),
]
G["DAL"] = [
    (2010, 2027, "Jerry Jones", 1989, "owner (bought DAL in 1989; oil and gas executive)", None),
]
H["DAL"] = [
    (2010, 2010, "Wade Phillips", 2007, "SD defensive coordinator", None),
    (2011, 2019, "Jason Garrett", 2010, "DAL offensive coordinator (interim HC from Nov 2010)", None),
    (2020, 2024, "Mike McCarthy", 2020, "out of football (ex-GB head coach)", None),
    (2025, 2027, "Brian Schottenheimer", 2025, "DAL offensive coordinator", None),
]
G["DEN"] = [
    (2010, 2011, "Brian Xanders", 2009, "ATL director of football administration", None),
    (2012, 2020, "John Elway", 2011, "Colorado Crush (Arena Football) co-owner; ex-DEN QB", None),
    (2021, 2027, "George Paton", 2021, "MIN assistant GM", None),
]
H["DEN"] = [
    (2010, 2010, "Josh McDaniels", 2009, "NE offensive coordinator", None),
    (2011, 2014, "John Fox", 2011, "CAR head coach", None),
    (2015, 2016, "Gary Kubiak", 2015, "BAL offensive coordinator", None),
    (2017, 2018, "Vance Joseph", 2017, "MIA defensive coordinator", None),
    (2019, 2021, "Vic Fangio", 2019, "CHI defensive coordinator", None),
    (2022, 2022, "Nathaniel Hackett", 2022, "GB offensive coordinator", None),
    (2023, 2027, "Sean Payton", 2023, "FOX analyst (ex-NO head coach)", None),
]
G["DET"] = [
    (2010, 2015, "Martin Mayhew", 2009, "DET assistant GM", None),
    (2016, 2020, "Bob Quinn", 2016, "NE director of pro scouting", None),
    (2021, 2027, "Brad Holmes", 2021, "LA director of college scouting", None),
]
H["DET"] = [
    (2010, 2013, "Jim Schwartz", 2009, "TEN defensive coordinator", None),
    (2014, 2017, "Jim Caldwell", 2014, "BAL offensive coordinator", None),
    (2018, 2020, "Matt Patricia", 2018, "NE defensive coordinator", None),
    (2021, 2027, "Dan Campbell", 2021, "NO assistant head coach / TE coach", None),
]
G["GB"] = [
    (2010, 2017, "Ted Thompson", 2005, "SEA VP of football operations", None),
    (2018, 2027, "Brian Gutekunst", 2018, "GB director of player personnel", None),
]
H["GB"] = [
    (2010, 2018, "Mike McCarthy", 2006, "SF offensive coordinator", None),
    (2019, 2027, "Matt LaFleur", 2019, "TEN offensive coordinator", None),
]
G["HOU"] = [
    (2010, 2017, "Rick Smith", 2006, "DEN assistant director of pro personnel", None),
    (2018, 2019, "Brian Gaine", 2018, "BUF VP of player personnel", None),
    (2020, 2020, "Bill O'Brien", 2020, "HOU head coach", None),
    (2021, 2027, "Nick Caserio", 2021, "NE director of player personnel", None),
]
H["HOU"] = [
    (2010, 2013, "Gary Kubiak", 2006, "DEN offensive coordinator", None),
    (2014, 2020, "Bill O'Brien", 2014, "Penn State head coach", None),
    (2021, 2021, "David Culley", 2021, "BAL assistant head coach / WR coach", None),
    (2022, 2022, "Lovie Smith", 2022, "HOU associate head coach / defensive coordinator", None),
    (2023, 2027, "DeMeco Ryans", 2023, "SF defensive coordinator", None),
]
G["IND"] = [
    (2010, 2011, "Chris Polian", 2010, "IND VP of football operations", "https://en.wikipedia.org/wiki/Chris_Polian"),
    (2012, 2016, "Ryan Grigson", 2012, "PHI director of player personnel", None),
    (2017, 2027, "Chris Ballard", 2017, "KC director of football operations", None),
]
H["IND"] = [
    (2010, 2011, "Jim Caldwell", 2009, "IND assistant head coach / QB coach", None),
    (2012, 2017, "Chuck Pagano", 2012, "BAL defensive coordinator", None),
    (2018, 2022, "Frank Reich", 2018, "PHI offensive coordinator", None),
    (2023, 2027, "Shane Steichen", 2023, "PHI offensive coordinator", None),
]
G["JAX"] = [
    (2010, 2012, "Gene Smith", 2009, "JAX director of college scouting", None),
    (2013, 2020, "David Caldwell", 2013, "ATL director of player personnel", None),
    (2021, 2024, "Trent Baalke", 2021, "JAX director of player personnel (ex-SF GM); interim GM from Nov 2020", None),
    (2025, 2027, "James Gladstone", 2025, "LA director of scouting strategy", None),
]
H["JAX"] = [
    (2010, 2011, "Jack Del Rio", 2003, "CAR defensive coordinator", None),
    (2012, 2012, "Mike Mularkey", 2012, "ATL offensive coordinator", None),
    (2013, 2016, "Gus Bradley", 2013, "SEA defensive coordinator", None),
    (2017, 2020, "Doug Marrone", 2016, "JAX assistant head coach / OL coach (ex-BUF HC; interim HC Dec 2016)", None),
    (2021, 2021, "Urban Meyer", 2021, "FOX analyst (ex-Ohio State head coach)", None),
    (2022, 2024, "Doug Pederson", 2022, "out of football (ex-PHI head coach)", None),
    (2025, 2027, "Liam Coen", 2025, "TB offensive coordinator", None),
]
G["KC"] = [
    (2010, 2012, "Scott Pioli", 2009, "NE VP of player personnel", None),
    (2013, 2017, "John Dorsey", 2013, "GB director of football operations", None),
    (2018, 2027, "Brett Veach", 2018, "KC co-director of player personnel", None),
]
H["KC"] = [
    (2010, 2011, "Todd Haley", 2009, "ARI offensive coordinator", None),
    (2012, 2012, "Romeo Crennel", 2011, "KC defensive coordinator (interim HC Dec 2011)", None),
    (2013, 2027, "Andy Reid", 2013, "PHI head coach", None),
]
G["LV"] = [
    (2010, 2011, "Al Davis", 1963, "OAK owner; head coach/GM from 1963 (AFL commissioner 1966)", None),
    (2012, 2018, "Reggie McKenzie", 2012, "GB director of football operations", None),
    (2019, 2021, "Mike Mayock", 2019, "NFL Network draft analyst", None),
    (2022, 2023, "Dave Ziegler", 2022, "NE director of player personnel", None),
    (2024, 2024, "Tom Telesco", 2024, "former LAC GM (fired Dec 2023)", None),
    (2025, 2027, "John Spytek", 2025, "TB assistant GM", None),
]
H["LV"] = [
    (2010, 2010, "Tom Cable", 2008, "OAK offensive line coach (interim HC 2008)", None),
    (2011, 2011, "Hue Jackson", 2011, "OAK offensive coordinator", None),
    (2012, 2014, "Dennis Allen", 2012, "DEN defensive coordinator", None),
    (2015, 2017, "Jack Del Rio", 2015, "DEN defensive coordinator", None),
    (2018, 2021, "Jon Gruden", 2018, "ESPN analyst (ex-TB head coach)", None),
    (2022, 2023, "Josh McDaniels", 2022, "NE offensive coordinator", None),
    (2024, 2024, "Antonio Pierce", 2023, "LV linebackers coach (interim HC from Nov 2023)", None),
    (2025, 2025, "Pete Carroll", 2025, "out of football (ex-SEA head coach)", None),
    (2026, 2027, "Klint Kubiak", 2026, "SEA offensive coordinator", NBC26),
]
G["LAC"] = [
    (2010, 2012, "A.J. Smith", 2003, "SD assistant GM", None),
    (2013, 2023, "Tom Telesco", 2013, "IND VP of football operations", None),
    (2024, 2027, "Joe Hortiz", 2024, "BAL director of player personnel", None),
]
H["LAC"] = [
    (2010, 2012, "Norv Turner", 2007, "SF offensive coordinator", None),
    (2013, 2016, "Mike McCoy", 2013, "DEN offensive coordinator", None),
    (2017, 2020, "Anthony Lynn", 2017, "BUF offensive coordinator", None),
    (2021, 2023, "Brandon Staley", 2021, "LA defensive coordinator", None),
    (2024, 2027, "Jim Harbaugh", 2024, "Michigan head coach", None),
]
G["LA"] = [
    (2010, 2011, "Billy Devaney", 2009, "STL VP/EVP of player personnel", "https://en.wikipedia.org/wiki/Billy_Devaney"),
    (2012, 2027, "Les Snead", 2012, "ATL director of player personnel", "https://www.stlpr.org/2012-02-14/les-snead-officially-named-gm-of-the-st-louis-rams"),
]
H["LA"] = [
    (2010, 2011, "Steve Spagnuolo", 2009, "NYG defensive coordinator", None),
    (2012, 2016, "Jeff Fisher", 2012, "out of football (ex-TEN head coach)", None),
    (2017, 2027, "Sean McVay", 2017, "WAS offensive coordinator", None),
]
G["MIA"] = [
    (2010, 2013, "Jeff Ireland", 2008, "DAL VP of college and pro scouting", None),
    (2014, 2015, "Dennis Hickey", 2014, "TB director of player personnel", None),
    (2016, 2025, "Chris Grier", 2016, "MIA director of college scouting", None),
    (2026, 2027, "Jon-Eric Sullivan", 2026, "GB VP of player personnel", NBC26),
]
H["MIA"] = [
    (2010, 2011, "Tony Sparano", 2008, "DAL assistant head coach / OL coach", None),
    (2012, 2015, "Joe Philbin", 2012, "GB offensive coordinator", None),
    (2016, 2018, "Adam Gase", 2016, "CHI offensive coordinator", None),
    (2019, 2021, "Brian Flores", 2019, "NE linebackers coach / defensive play caller", None),
    (2022, 2025, "Mike McDaniel", 2022, "SF offensive coordinator", None),
    (2026, 2027, "Jeff Hafley", 2026, "GB defensive coordinator", NBC26),
]
G["MIN"] = [
    (2010, 2021, "Rick Spielman", 2007, "MIA GM (2004-05)", None),
    (2022, 2025, "Kwesi Adofo-Mensah", 2022, "CLE VP of football operations", None),
    (2026, 2026, "Rob Brzezinski", 2026, "MIN EVP of football operations", "https://www.fox9.com/sports/vikings-announce-search-new-gm-nfl-draft-over"),
    (2027, 2027, "Nolan Teasley", 2027, "SEA assistant GM", "https://www.nfl.com/news-migrated-v2/vikings-hiring-seahawks-assistant-general-manager-nolan-teasley-as-new-gm"),
]
H["MIN"] = [
    (2010, 2010, "Brad Childress", 2006, "PHI offensive coordinator", None),
    (2011, 2013, "Leslie Frazier", 2010, "MIN defensive coordinator (interim HC Nov 2010)", None),
    (2014, 2021, "Mike Zimmer", 2014, "CIN defensive coordinator", None),
    (2022, 2027, "Kevin O'Connell", 2022, "LA offensive coordinator", None),
]
G["NE"] = [
    (2010, 2023, "Bill Belichick", 2000, "NYJ assistant head coach (ex-CLE head coach)", None),
    (2024, 2027, "Eliot Wolf", 2024, "NE director of scouting (ex-CLE assistant GM)", None),
]
H["NE"] = [
    (2010, 2023, "Bill Belichick", 2000, "NYJ assistant head coach (ex-CLE head coach)", None),
    (2024, 2024, "Jerod Mayo", 2024, "NE inside linebackers coach", None),
    (2025, 2027, "Mike Vrabel", 2025, "CLE coaching and personnel consultant (ex-TEN head coach)", None),
]
G["NO"] = [
    (2010, 2027, "Mickey Loomis", 2002, "NO director of football administration", "https://en.wikipedia.org/wiki/Mickey_Loomis"),
]
H["NO"] = [
    (2010, 2021, "Sean Payton", 2006, "DAL assistant head coach / QB coach", None),
    (2022, 2024, "Dennis Allen", 2022, "NO defensive coordinator", None),
    (2025, 2027, "Kellen Moore", 2025, "PHI offensive coordinator", None),
]
G["NYG"] = [
    (2010, 2017, "Jerry Reese", 2007, "NYG director of player personnel", None),
    (2018, 2021, "Dave Gettleman", 2018, "former CAR GM (fired July 2017)", None),
    (2022, 2027, "Joe Schoen", 2022, "BUF assistant GM", None),
]
H["NYG"] = [
    (2010, 2015, "Tom Coughlin", 2004, "out of football (ex-JAX head coach)", None),
    (2016, 2017, "Ben McAdoo", 2016, "NYG offensive coordinator", None),
    (2018, 2019, "Pat Shurmur", 2018, "MIN offensive coordinator", None),
    (2020, 2021, "Joe Judge", 2020, "NE special teams coordinator / WR coach", None),
    (2022, 2025, "Brian Daboll", 2022, "BUF offensive coordinator", None),
    (2026, 2027, "John Harbaugh", 2026, "BAL head coach", NBC26),
]
G["NYJ"] = [
    (2010, 2012, "Mike Tannenbaum", 2006, "NYJ assistant GM", None),
    (2013, 2014, "John Idzik", 2013, "SEA VP of football administration", None),
    (2015, 2019, "Mike Maccagnan", 2015, "HOU director of college scouting", None),
    (2020, 2024, "Joe Douglas", 2020, "PHI VP of player personnel", None),
    (2025, 2027, "Darren Mougey", 2025, "DEN assistant GM", None),
]
H["NYJ"] = [
    (2010, 2014, "Rex Ryan", 2009, "BAL defensive coordinator", None),
    (2015, 2018, "Todd Bowles", 2015, "ARI defensive coordinator", None),
    (2019, 2020, "Adam Gase", 2019, "MIA head coach", None),
    (2021, 2024, "Robert Saleh", 2021, "SF defensive coordinator", None),
    (2025, 2027, "Aaron Glenn", 2025, "DET defensive coordinator", None),
]
G["PHI"] = [
    (2010, 2014, "Howie Roseman", 2010, "PHI VP of player personnel", None),
    (2015, 2015, "Chip Kelly", 2015, "PHI head coach", None),
    (2016, 2027, "Howie Roseman", 2016, "PHI EVP of football operations without personnel power (2015); PHI GM 2010-14", None),
]
H["PHI"] = [
    (2010, 2012, "Andy Reid", 1999, "GB quarterbacks coach", None),
    (2013, 2015, "Chip Kelly", 2013, "Oregon head coach", None),
    (2016, 2020, "Doug Pederson", 2016, "KC offensive coordinator", None),
    (2021, 2027, "Nick Sirianni", 2021, "IND offensive coordinator", None),
]
G["PIT"] = [
    (2010, 2022, "Kevin Colbert", 2000, "DET director of pro personnel", None),
    (2023, 2027, "Omar Khan", 2023, "PIT VP of football and business administration", None),
]
H["PIT"] = [
    (2010, 2025, "Mike Tomlin", 2007, "MIN defensive coordinator", None),
    (2026, 2027, "Mike McCarthy", 2026, "out of football (ex-DAL head coach)", NBC26),
]
G["SF"] = [
    (2010, 2016, "Trent Baalke", 2010, "SF director of player personnel", None),
    (2017, 2027, "John Lynch", 2017, "FOX game analyst (ex-player)", None),
]
H["SF"] = [
    (2010, 2010, "Mike Singletary", 2008, "SF assistant head coach / LB coach (interim HC Oct 2008)", None),
    (2011, 2014, "Jim Harbaugh", 2011, "Stanford head coach", None),
    (2015, 2015, "Jim Tomsula", 2015, "SF defensive line coach", None),
    (2016, 2016, "Chip Kelly", 2016, "out of football (ex-PHI head coach)", None),
    (2017, 2027, "Kyle Shanahan", 2017, "ATL offensive coordinator", None),
]
G["SEA"] = [
    (2010, 2027, "John Schneider", 2010, "GB director of football operations", None),
]
H["SEA"] = [
    (2010, 2023, "Pete Carroll", 2010, "USC head coach", None),
    (2024, 2027, "Mike Macdonald", 2024, "BAL defensive coordinator", None),
]
G["TB"] = [
    (2010, 2013, "Mark Dominik", 2009, "TB director of pro personnel", None),
    (2014, 2027, "Jason Licht", 2014, "ARI VP of player personnel", None),
]
H["TB"] = [
    (2010, 2011, "Raheem Morris", 2009, "TB defensive backs coach", None),
    (2012, 2013, "Greg Schiano", 2012, "Rutgers head coach", None),
    (2014, 2015, "Lovie Smith", 2014, "out of football (ex-CHI head coach)", None),
    (2016, 2018, "Dirk Koetter", 2016, "TB offensive coordinator", None),
    (2019, 2021, "Bruce Arians", 2019, "CBS analyst (ex-ARI head coach)", None),
    (2022, 2027, "Todd Bowles", 2022, "TB defensive coordinator", None),
]
G["TEN"] = [
    (2010, 2011, "Mike Reinfeldt", 2007, "SEA VP of football administration", "https://en.wikipedia.org/wiki/Mike_Reinfeldt"),
    (2012, 2015, "Ruston Webster", 2012, "TEN VP of player personnel", None),
    (2016, 2022, "Jon Robinson", 2016, "TB director of player personnel", None),
    (2023, 2024, "Ran Carthon", 2023, "SF director of pro personnel", None),
    (2025, 2027, "Mike Borgonzi", 2025, "KC assistant GM", None),
]
H["TEN"] = [
    (2010, 2010, "Jeff Fisher", 1994, "HOU Oilers defensive coordinator", None),
    (2011, 2013, "Mike Munchak", 2011, "TEN offensive line coach", None),
    (2014, 2015, "Ken Whisenhunt", 2014, "SD offensive coordinator", None),
    (2016, 2017, "Mike Mularkey", 2015, "TEN assistant head coach / TE coach (interim HC Nov 2015)", None),
    (2018, 2023, "Mike Vrabel", 2018, "HOU defensive coordinator", None),
    (2024, 2025, "Brian Callahan", 2024, "CIN offensive coordinator", None),
    (2026, 2027, "Robert Saleh", 2026, "SF defensive coordinator", NBC26),
]
G["WAS"] = [
    (2010, 2014, "Bruce Allen", 2010, "former TB GM (2004-08)", None),
    (2015, 2016, "Scot McCloughan", 2015, "SEA senior personnel executive", None),
    (2017, 2019, "Bruce Allen", 2010, "WAS president (GM 2010-14)", None),
    (2020, 2020, "Ron Rivera", 2020, "CAR head coach", None),
    (2021, 2023, "Martin Mayhew", 2021, "SF VP of player personnel", None),
    (2024, 2027, "Adam Peters", 2024, "SF assistant GM", None),
]
H["WAS"] = [
    (2010, 2013, "Mike Shanahan", 2010, "out of football (ex-DEN head coach)", None),
    (2014, 2019, "Jay Gruden", 2014, "CIN offensive coordinator", None),
    (2020, 2023, "Ron Rivera", 2020, "CAR head coach", None),
    (2024, 2027, "Dan Quinn", 2024, "DAL defensive coordinator", None),
]

# draft_lead overrides: team -> list of (first, last, lead, note, source url or "memory")
LEAD = {
    "CIN": [(2010, 2027, "owner", "Owner/president Mike Brown acts as GM (no GM title); Duke Tobin runs player personnel", PFR)],
    "DAL": [(2010, 2027, "owner", "Owner Jerry Jones is GM; Stephen Jones and Will McClay run personnel under him", PFR)],
    "LV": [(2010, 2011, "owner", "Owner Al Davis ran football operations", PFR),
           (2018, 2021, "hc", "Jon Gruden had final say on personnel", "memory")],
    "NE": [(2010, 2023, "hc", "No GM title; Bill Belichick had final say (de facto GM)", PFR),
           (2025, 2027, "hc", "Vrabel reported as final decision maker on adding talent (NBC Sports Boston, Jan 2025); Wolf leads scouting",
            "https://www.nbcboston.com/news/sports/nfl/new-england-patriots/front-office-power-structure-eliot-wolf-mike-vrabel/3602039/")],
    "SEA": [(2010, 2023, "hc", "Pete Carroll (also EVP of football operations) had final say on the roster", "memory")],
    "SF": [(2017, 2027, "shared", "Shanahan and Lynch hired together on matching deals; both report to Jed York", "memory")],
    "PHI": [(2010, 2012, "hc", "Andy Reid (also EVP of football operations) had final say", PFR),
            (2015, 2015, "hc", "Chip Kelly had personnel control (no GM); Ed Marynowitz VP of player personnel; Roseman moved off personnel", PFR)],
    "WAS": [(2010, 2013, "hc", "Mike Shanahan had final say on football decisions", PFR),
            (2020, 2020, "hc", "No GM; Ron Rivera had final say; Kyle Smith VP of player personnel", PFR),
            (2021, 2023, "hc", "Rivera kept final say over GM Mayhew", "memory")],
    "DEN": [(2010, 2010, "hc", "Josh McDaniels controlled personnel decisions", "memory"),
            (2023, 2027, "shared", "Reported Apr 2023: Paton won't make a pick or trade without Payton's approval",
             "https://www.si.com/nfl/broncos/news/george-paton-personnel-approval-sean-payton")],
    "HOU": [(2020, 2020, "hc", "No GM; O'Brien was head coach and GM (title Jan 2020, de facto since June 2019)", PFR)],
    "JAX": [(2021, 2021, "hc", "Urban Meyer had final say on the roster", "memory")],
    "NYG": [(2026, 2027, "shared", "Harbaugh reports only to ownership; SVP Dawn Aponte reports to him; reports say Schoen focuses on scouting (Feb 2026), both call it overblown",
             "https://sportsnaut.com/nfl/giants-management-structure-harbaugh")],
}

# extra notes: team -> list of (first, last, note, source or None)
NOTES = {
    "ARI": [],
    "ATL": [(2026, 2027, "Matt Ryan hired Jan 2026 as president of football, above GM and HC", NBC26)],
    "BAL": [(2010, 2018, "Newsome ran Ravens drafts from 1996 as VP of player personnel; GM title 2002", None)],
    "BUF": [(2013, 2013, "Nix stepped down May 2013, after this draft", "https://en.wikipedia.org/wiki/Buddy_Nix"),
            (2014, 2014, "Whaley took over May 2013", None),
            (2017, 2017, "Whaley fired the day after this draft (Apr 30, 2017)", None),
            (2018, 2018, "Beane hired May 2017", None),
            (2026, 2027, "Beane promoted to president of football operations and GM (Jan 2026)",
             "https://wtop.com/nfl/2026/01/bills-fire-sean-mcdermott-after-9-seasons-of-falling-short-of-reaching-super-bowl-ap-sources-say/")],
    "CAR": [(2018, 2018, "Hurney interim GM from July 2017, then permanent", None)],
    "CLE": [(2010, 2012, "President Mike Holmgren oversaw football operations above GM Heckert", None),
            (2013, 2013, "CEO Joe Banner oversaw football operations", None),
            (2016, 2017, "Sashi Brown EVP of football operations (no GM title); Paul DePodesta chief strategy officer", PFR),
            (2018, 2018, "Dorsey hired Dec 2017", None)],
    "DEN": [(2011, 2011, "John Elway (EVP of football operations, hired Jan 2011) had final say above GM Xanders", PFR),
            (2012, 2020, "Elway top football executive (EVP of football operations, later also GM title)", PFR)],
    "DET": [(2010, 2010, "Mayhew named GM Sept 2008", None)],
    "HOU": [(2019, 2019, "Gaine fired June 2019, after this draft", PFR)],
    "IND": [(2010, 2011, "Father Bill Polian (president, then vice chairman) had final say", "https://en.wikipedia.org/wiki/Chris_Polian")],
    "JAX": [(2017, 2019, "Tom Coughlin (EVP of football operations, Jan 2017-Dec 2019) had final say over GM Caldwell", None),
            (2021, 2021, "Baalke interim GM Nov 2020, permanent Jan 2021", None)],
    "KC": [(2013, 2017, "Reid said the GM has final say on personnel (Jan 2013)", "https://www.si.com/si-wire/2013/01/13/chiefs-john-dorsey-next-gm"),
           (2018, 2027, "Veach has final say on the 53-man roster, working with Reid (Hunt, July 2017)", "https://profootballrumors.com/2017/07/brett-veach-chiefs-gm")],
    "LA": [(2012, 2016, "Team said Snead has final authority on personnel; Fisher works with him (Feb 2012)", "https://www.stlpr.org/2012-02-14/les-snead-officially-named-gm-of-the-st-louis-rams")],
    "LV": [(2018, 2018, "McKenzie fired Dec 2018", None),
           (2025, 2027, "Minority owner Tom Brady involved in football decisions", None)],
    "MIA": [(2010, 2010, "Bill Parcells (EVP of football operations until Sept 2010) had final say", None),
            (2015, 2018, "Mike Tannenbaum (EVP of football operations, Jan 2015-Dec 2018) had final say above the GM", None),
            (2026, 2026, "Grier left Oct 31, 2025; Champ Kelly interim GM until Sullivan's hire (Jan 2026)", W26)],
    "MIN": [(2010, 2011, "Spielman's title was VP of player personnel (no GM; 'triangle of authority' with HC and Rob Brzezinski); GM title Jan 2012", None),
            (2026, 2026, "Acting GM after Adofo-Mensah was fired Jan 30, 2026", "https://www.fox9.com/sports/vikings-announce-search-new-gm-nfl-draft-over"),
            (2027, 2027, "Teasley hired as GM June 2026", W26)],
    "NE": [(2024, 2024, "No GM title; Wolf EVP of player personnel, de facto GM", PFR)],
    "NO": [(2012, 2012, "Payton suspended for the 2012 season from Apr 16, 2012 (bounty case); Joe Vitt acting HC", None)],
    "NYJ": [(2019, 2019, "Maccagnan fired May 2019, after this draft", PFR),
            (2020, 2020, "Douglas hired June 2019", None)],
    "PHI": [(2016, 2016, "Roseman back in charge of personnel after Kelly's firing (also GM 2010-14)", PFR)],
    "PIT": [(2010, 2010, "Colbert's title was director of football operations (GM title from 2011)", None),
            (2022, 2022, "Colbert's last draft; Khan named GM May 2022", PFR)],
    "SF": [(2010, 2010, "Scot McCloughan left March 2010; Baalke ran this draft as VP of player personnel; GM title Jan 2011", PFR)],
    "SEA": [(2024, 2027, "Schneider took final say after Carroll left", None)],
    "TEN": [(2025, 2027, "Chad Brinker president of football operations (Jan 2025), above GM", None)],
    "WAS": [(2015, 2016, "President Bruce Allen above GM McCloughan", None),
            (2017, 2017, "No GM after McCloughan was fired March 2017; president Allen had final say; Doug Williams promoted to SVP of player personnel June 2017",
             "https://www.si.com/nfl/2017/06/13/redskins-doug-williams-senior-vp-player-personnel"),
            (2018, 2019, "No GM; president Bruce Allen had final say; Doug Williams SVP of player personnel, Kyle Smith VP of player personnel", None)],
}

TEAM_NAME_NOTE = {
    "LV": [(2010, 2019, "as Oakland Raiders")],
    "LAC": [(2010, 2016, "as San Diego Chargers")],
    "LA": [(2010, 2015, "as St. Louis Rams")],
    "WAS": [(2010, 2019, "as Washington Redskins"), (2020, 2021, "as Washington Football Team")],
}


def find(tenures, y):
    hits = [t for t in tenures if t[0] <= y <= t[1]]
    assert len(hits) == 1, (tenures, y, hits)
    return hits[0]


def nflverse_coaches(path):
    """First-game head coach of each team-season from nflverse games.csv."""
    alias = {"OAK": "LV", "SD": "LAC", "STL": "LA"}
    first = {}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        if r["game_type"] != "REG" or r["away_score"] == "":
            continue
        s = int(r["season"])
        for t, c in ((r["away_team"], r["away_coach"]), (r["home_team"], r["home_coach"])):
            t = alias.get(t, t)
            key = (s, t)
            if key not in first or r["gameday"] < first[key][0]:
                first[key] = (r["gameday"], c)
    return {k: v[1] for k, v in first.items()}


def main(games_csv):
    nfl = nflverse_coaches(games_csv)
    teams = sorted(G)
    assert len(teams) == 32 and sorted(H) == teams
    rows = []
    mismatches = []
    for y in YEARS:
        for t in teams:
            g = find(G[t], y)
            h = find(H[t], y)
            lead, notes, srcs, mem = "gm", [], [], False
            for (a, b, nm) in TEAM_NAME_NOTE.get(t, []):
                if a <= y <= b:
                    notes.append(nm)
            for (a, b, ld, note, src) in LEAD.get(t, []):
                if a <= y <= b:
                    lead = ld
                    notes.append(note)
                    if src == "memory":
                        mem = True
                    else:
                        srcs.append(src)
            for (a, b, note, src) in NOTES.get(t, []):
                if a <= y <= b:
                    notes.append(note)
                    if src:
                        srcs.append(src)
                    else:
                        mem = True
            # GM source: PFR executives index for 2010-2025 seasons and 2026 hires; W26 for 2026-27
            srcs.insert(0, PFR)
            if y >= 2026:
                srcs.append(W26)
            # HC source and check
            if y <= 2025:
                srcs.append(NFLV)
                coach = nfl.get((y, t))
                expected = h[2]
                if t == "NO" and y == 2012:
                    pass  # Payton suspended; nflverse shows interim Kromer
                elif coach != expected:
                    mismatches.append((y, t, expected, coach))
            for extra in (g[5], h[5]):
                if extra:
                    srcs.append(extra)
            # prev roles are memory unless a checked page is cited for both
            if not (g[5] and h[5]):
                mem = True
            seen = []
            for s in srcs:
                if s not in seen:
                    seen.append(s)
            if mem:
                seen.append("memory (prev roles, some notes)")
            rows.append({
                "draft_year": y, "team": t, "gm": g[2], "hc": h[2], "draft_lead": lead,
                "gm_start": g[3], "hc_start": h[3], "gm_prev": g[4], "hc_prev": h[4],
                "notes": "; ".join(notes), "source": " | ".join(seen),
            })
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    cols = ["draft_year", "team", "gm", "hc", "draft_lead", "gm_start", "hc_start", "gm_prev", "hc_prev", "notes", "source"]
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print("rows", len(rows))
    print("HC mismatches vs nflverse first game:", len(mismatches))
    for m in mismatches:
        print("  ", m)
    # sanity: starts not after draft year
    for r in rows:
        if r["gm_start"] > r["draft_year"] or r["hc_start"] > r["draft_year"]:
            print("start after draft:", r["draft_year"], r["team"], r["gm"], r["gm_start"], r["hc"], r["hc_start"])
    c = collections.Counter(r["draft_lead"] for r in rows)
    print(c)


if __name__ == "__main__":
    main(sys.argv[1])
