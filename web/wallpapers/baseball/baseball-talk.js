// The Never-Ending Baseball Season's announcer (SPEC §10.37): one line for
// everything that happens, said by a man who has had too much coffee. Pure:
// a play and a few names in, a sentence out. All capitals, because the
// lettering is (baseball-art.js).
//
// In a line: {B} the batter, {P} the pitcher, {F} where it was hit, {G} the
// fielder's name, {R} a runner, {T} the club at bat, {D} the club in the
// field, {N} a number, {X} a base.

const BaseballTalk = (() => {
    'use strict';
    const WHERE = ['THE MOUND', 'THE PLATE', 'FIRST', 'SECOND', 'THIRD', 'SHORT', 'LEFT', 'CENTRE', 'RIGHT'];
    const BAG = ['THE PLATE', 'FIRST', 'SECOND', 'THIRD', 'THE PLATE'];
    const LINES = {
        K: ['{B} SWINGS THROUGH IT. STRIKE THREE!', 'GOT HIM! {B} GOES DOWN SWINGING.', '{P} BLOWS IT RIGHT BY {B}!', 'A MIGHTY CUT FROM {B}. A MIGHTY BREEZE.', 'SIT DOWN, {B}! THAT IS STRIKE THREE.'],
        Kl: ['{B} WATCHES STRIKE THREE GO BY.', 'CALLED STRIKE THREE! {B} CANNOT BELIEVE IT.', '{B} IS FROZEN SOLID. STRIKE THREE!', 'THE BAT NEVER LEFT HIS SHOULDER. {B} IS OUT.'],
        BB: ['BALL FOUR. {B} TAKES HIS BASE.', '{P} CANNOT FIND THE PLATE. {B} WALKS.', 'A WALK FOR {B}. THRILLING STUFF, FOLKS.', '{B} HAS A GOOD EYE AND A FREE BASE.'],
        HBP: ['OUCH! THAT ONE GOT {B} RIGHT IN THE RIBS.', '{B} WEARS IT! HE WILL FEEL THAT TOMORROW.', 'PLUNK! {B} TAKES ONE FOR THE {T}.', 'THAT HIT {B} IN THE BACK POCKET. TAKE YOUR BASE.'],
        '1B': ['BASE HIT FOR {B}!', '{B} PUNCHES IT INTO {F}!', 'A SINGLE TO {F} FOR {B}.', '{B} DROPS IT IN FRONT OF THE MAN IN {F}!', 'THAT WILL PLAY. {B} IS ON WITH A SINGLE.'],
        '1Bi': ['{B} BEATS IT OUT! AN INFIELD HIT!', 'NOBODY CAN MAKE A PLAY! {B} IS SAFE AT FIRST!', 'A SLOW ROLLER AND A FAST {B}. BASE HIT!'],
        '2B': ['{B} RIPS IT INTO {F}! THAT IS A DOUBLE!', 'INTO THE GAP! {B} CRUISES INTO SECOND.', 'A STAND-UP DOUBLE FOR {B}!', 'TWO BAGS FOR {B}! HE HIT THAT A LONG WAY.'],
        '2Bw': ['OFF THE WALL! {B} IS IN WITH A DOUBLE!', 'HIGH OFF THE FENCE IN {F}! A DOUBLE FOR {B}!'],
        '3B': ['IT IS ROLLING ABOUT IN THE CORNER! {B} HAS A TRIPLE!', 'THREE BAGS FOR {B}! HE WILL NEED A LIE DOWN.', '{B} IS FLYING! A TRIPLE!', 'ALL THE WAY TO THIRD! {B}, YOU BEAUTY!'],
        HR: ['THAT BALL IS GONE! {B}! {N} FEET!', 'GOODBYE! {B} SENDS IT {N} FEET OVER THE FENCE!', '{B} CRUSHES IT! SOMEBODY WARN THE MOON!', 'KISS IT GOODBYE! {B} HAS HIT IT {N} FEET!', 'HOME RUN, {B}! THAT ONE NEEDS A PASSPORT!', 'OH MY! {B}! {N} FEET AND STILL RISING!'],
        HRs: ['GRAND SLAM! {B} CLEARS THE TABLE!', 'A GRAND SLAM! {B}! FOUR RUNS WITH ONE SWING!'],
        HRi: ['{B} IS STILL RUNNING! AN INSIDE-THE-PARK HOME RUN!', 'HE IS GOING TO TRY FOR HOME! SAFE! {B} RAN ALL THE WAY ROUND!'],
        HRw: ['IT IS OVER! {B} WALKS IT OFF! THE {T} WIN!', 'BALL GAME! {B} ENDS IT WITH ONE SWING!', '{B}! GOODNIGHT EVERYBODY! THE {T} WIN IT!'],
        GO: ['{B} GROUNDS OUT TO {F}.', 'A ROUTINE GROUNDER. {F} TO FIRST. OUT.', '{B} BOUNCES OUT, {F} TO FIRST.', 'A CHOPPER TO {F}. {B} IS OUT BY A STEP.', 'ON THE GROUND TO {F}. EASY OUT.'],
        FO: ['{B} FLIES OUT TO {F}.', 'A CAN OF CORN TO {F}.', 'HIGH IN THE AIR... {G} IS UNDER IT. OUT.', '{B} GETS UNDER IT. CAUGHT IN {F}.', 'A LAZY FLY TO {F}. {G} SQUEEZES IT.'],
        FOd: ['TO THE WARNING TRACK... CAUGHT! SO CLOSE FOR {B}!', 'BACK GOES {G}... AT THE FENCE... HE HAS IT!', '{B} GOT ALL OF IT... ALMOST. CAUGHT AT THE TRACK.'],
        dive: ['WHAT A CATCH! {G} LAYS OUT FOR IT!', 'A DIVING GRAB BY {G}! ARE YOU KIDDING ME?', '{G} FLIES THROUGH THE AIR! OUT! UNBELIEVABLE!'],
        robbed: ['ROBBED! {G} WENT UP THE WALL AND TOOK IT BACK!', '{G} HAS STOLEN A HOME RUN! {B} CANNOT BELIEVE IT!'],
        LO: ['A LINER, RIGHT AT {G}. OUT.', '{B} SMOKES IT... STRAIGHT INTO A GLOVE.', 'HIT HARD, BUT RIGHT AT {F}. OUT.', 'A ROCKET! AND {G} SNARES IT!'],
        PO: ['{B} POPS IT UP. {G} HAS IT.', 'SKY HIGH AND GOING NOWHERE. {F} MAKES THE CATCH.', 'A POP-UP TO {F}. ONE HAND. SHOWING OFF.', '{B} HITS IT A MILE HIGH. STRAIGHT UP, SADLY.'],
        POf: ['{G} DRIFTS INTO FOUL GROUND... AND HE HAS IT!', 'A FOUL POP. {G} CAMPS UNDER IT. OUT.'],
        DP: ['DOUBLE PLAY! TWO FOR THE PRICE OF ONE!', '{F} STARTS IT... ONE... TWO! A TWIN KILLING!', '{B} GROUNDS INTO TWO. THE CROWD GROANS.', 'AROUND THE HORN! DOUBLE PLAY!', 'A PITCHER\'S BEST FRIEND! TWO OUTS ON ONE BALL!'],
        FC: ['{B} REACHES, BUT THE LEAD MAN IS OUT AT SECOND.', 'THEY GET THE FORCE AT SECOND. {B} IS SAFE AT FIRST.', 'A FIELDER\'S CHOICE. ONE OUT, ONE ON.'],
        E: ['OH NO! {G} BOOTS IT! EVERYBODY IS SAFE!', 'RIGHT THROUGH THE LEGS OF {G}! AN ERROR!', '{G} KICKS IT AROUND LIKE A FOOTBALL! ERROR!', 'THAT SHOULD HAVE BEEN AN OUT. {G} WILL NOT SLEEP TONIGHT.'],
        SF: ['DEEP ENOUGH! A SACRIFICE FLY FOR {B}!', '{B} LIFTS IT TO {F}. THE RUNNER TAGS... AND SCORES!', 'A FLY TO {F}, AND HERE COMES THE RUN!'],
        nailed: ['AND {R} IS OUT AT {X}! WHAT A THROW BY {G}!', '{R} TRIES FOR {X}... HE IS OUT! A PERFECT STRIKE FROM {G}!', 'THE THROW... THE TAG... {R} IS OUT AT {X}!'],
        sb: ['THERE GOES {R}! SAFE! A STOLEN BASE!', '{R} STEALS SECOND WITHOUT A THROW WORTH THE NAME!', '{R} TAKES OFF... AND HE IS IN THERE!'],
        cs: ['{R} GOES... AND HE IS OUT BY A MILE!', 'CAUGHT STEALING! {R} WILL WANT THAT ONE BACK.', 'THE CATCHER GUNS DOWN {R}! NOT TODAY!'],
        wild: ['THAT ONE GETS AWAY! EVERYBODY MOVES UP!', 'A WILD PITCH! THE CATCHER IS STILL LOOKING FOR IT!'],
        change: ['THAT IS ALL FOR {B}. HERE COMES {P} FROM THE BULLPEN.', '{B} HANDS OVER THE BALL. NOW PITCHING: {P}.', 'A LONG WALK FOR {B}. {P} TAKES OVER.'],
        save: ['THE {D} SEND FOR {P} TO LOCK THE DOOR.', 'HERE COMES {P} TO FINISH IT. CUE THE MUSIC.'],
        stretch: ['EVERYBODY UP! IT IS THE SEVENTH-INNING STRETCH!', 'STRETCH THOSE LEGS, FOLKS. SEVENTH INNING.'],
        rain: ['RAIN DELAY! OUT COMES THE TARP.', 'HERE COMES THE RAIN. THE ORGANIST IS TAKING REQUESTS.', 'THE HEAVENS HAVE OPENED. EVERYBODY UNDER THE TARP.'],
        dry: ['THE SUN IS BACK. PLAY BALL!', 'THE TARP IS OFF. WHERE WERE WE?'],
        lights: ['THE LIGHTS ARE ON. NIGHT BASEBALL, FOLKS!', 'ON COME THE LIGHTS. MOTHS, TAKE YOUR SEATS.'],
        playball: ['PLAY BALL!', 'HERE WE GO. PLAY BALL!', 'A BEAUTIFUL DAY FOR IT. PLAY BALL!'],
        hotdog: ['HOT DOGS! GET YOUR HOT DOGS!', 'ONE HOT DOG, COMING OVER!', 'MUSTARD IS EXTRA!'],
    };
    const NOTES = {
        nick: ['FROM THIS DAY ON HE IS "{K}" {L}.', 'THEY WILL CALL HIM "{K}" {L} AFTER THAT.', 'A NICKNAME IS BORN: "{K}" {L}!'],
        streak: ['THAT IS {N} GAMES IN A ROW WITH A HIT!', 'THE HITTING STREAK IS AT {N} GAMES!'],
        drought: ['THE DROUGHT IS OVER! HE WAS 0 FOR HIS LAST {N}.', 'FINALLY! HIS FIRST HIT IN {N} AT-BATS.'],
        spoiled: ['AND THERE GOES THE NO-HITTER.', 'THE NO-HITTER IS GONE. SOMEBODY MENTIONED IT.'],
        building: ['NOBODY SAY ANYTHING, BUT THE {T} DO NOT HAVE A HIT.', 'DO NOT LOOK AT THE SCOREBOARD. NO HITS FOR THE {T}.'],
        nohit: ['A NO-HITTER! HE HAS THROWN A NO-HITTER!', 'NO HITS! NOT ONE! A NO-HITTER!'],
    };
    const fill = (line, info) => line.replace(/\{(\w)\}/g, (_, key) => info[key] ?? '');
    const choose = (key, n) => LINES[key][Math.abs(n) % LINES[key].length];
    const ordinal = n => `${n}${['TH', 'ST', 'ND', 'RD'][n % 10 < 4 && (n % 100 < 11 || n % 100 > 13) ? n % 10 : 0]}`;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`;

    // What to say about a play that ended a batter's turn (or a steal, or a
    // change of pitcher). `n` picks among the ways of saying it.
    function call(play, info, n = 0) {
        const say = key => fill(choose(key, n), info);
        if (play.kind === 'change') return say(play.why === 'save' ? 'save' : 'change');
        const r = play.result, out = [];
        if (!r) return play.steal ? say(play.steal.out ? 'cs' : 'sb') : play.wild ? say('wild') : '';
        const key = r.code === 'K' ? (r.looking ? 'Kl' : 'K') : r.code === 'HR' ? (play.walkoff ? 'HRw' : r.inside ? 'HRi' : r.slam ? 'HRs' : 'HR')
            : r.robbed ? 'robbed' : r.dive ? 'dive' : r.code === 'FO' && r.deep ? 'FOd' : r.code === 'PO' && r.foul ? 'POf' : r.code === '1B' && r.infield ? '1Bi' : r.code === '2B' && r.wall ? '2Bw' : r.code;
        out.push(say(key));
        if (r.nailed) out.push(fill(choose('nailed', n), { ...info, X: BAG[r.nailed] }));
        if (play.steal) out.push(say(play.steal.out ? 'cs' : 'sb'));
        const runs = play.scored?.length || 0;
        if (play.walkoff && key !== 'HRw') out.push(`THE WINNING RUN SCORES! THE ${info.T} WIN IT!`);
        else if (runs && info.lead) out.push(`${runs > 1 ? `${plural(runs, 'RUN')} SCORE AND ` : ''}THE ${info.T} TAKE THE LEAD!`);
        else if (runs && info.tie) out.push(`${runs > 1 ? `${plural(runs, 'RUN')} SCORE! ` : ''}WE ARE ALL TIED UP!`);
        else if (runs && key !== 'HRs' && !(r.code === 'HR' && runs === 1)) out.push(runs === 1 ? 'A RUN SCORES.' : `${plural(runs, 'RUN')} SCORE!`);
        return out.join(' ');
    }
    // The short word that pops up over the field.
    function shout(play) {
        const r = play.result;
        if (!r) return play.steal ? (play.steal.out ? 'CAUGHT STEALING' : 'STOLEN BASE') : play.wild ? 'WILD PITCH' : { called: 'STRIKE', swinging: 'STRIKE', ball: 'BALL', foul: 'FOUL' }[play.call] || '';
        return { K: 'STRIKEOUT', BB: 'WALK', HBP: 'HIT BY PITCH', '1B': 'SINGLE', '2B': 'DOUBLE', '3B': 'TRIPLE', HR: r.slam ? 'GRAND SLAM!' : 'HOME RUN!', DP: 'DOUBLE PLAY', E: 'ERROR', SF: 'SAC FLY', FC: 'OUT AT SECOND' }[r.code] || 'OUT';
    }
    const note = (item, info, n = 0) => (NOTES[item.type] ? fill(NOTES[item.type][Math.abs(n) % NOTES[item.type].length], info) : '');
    const say = (key, info = {}, n = 0) => fill(choose(key, n), info);

    return { WHERE, BAG, LINES, NOTES, call, shout, note, say, ordinal, plural };
})();
