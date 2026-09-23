#!/usr/bin/env python3
"""Vehicle data and a run-time simulator for line 70.

MÁV 815 (Stadler KISS), 6-car, from the manufacturer and hu.wikipedia figures.
Sources disagree on mass — hu.wikipedia says 314 t empty, English-language
sources say 296 t. We use 314 t and treat it as the tare; a loaded suburban
set is heavier still, which is why LOAD_T exists.
"""
import math

G = 9.80665

class Stock:
    def __init__(self, name, mass_t, p_cont_kw, te_start_kn, v_max_kmh,
                 length_m, brake_service=0.90, brake_emerg=1.25,
                 rot_mass=1.08, cd_a=10.0, load_t=0.0):
        self.name = name
        self.mass_t = mass_t + load_t
        self.p_cont = p_cont_kw * 1000.0
        self.te_start = te_start_kn * 1000.0
        self.v_max = v_max_kmh / 3.6
        self.length_m = length_m
        self.b_serv = brake_service
        self.b_emerg = brake_emerg
        self.rot = rot_mass
        self.cd_a = cd_a

    def tractive_effort(self, v):
        """Newtons available at speed v (m/s): constant force, then constant power."""
        if v < 0.5:
            return self.te_start
        return min(self.te_start, self.p_cont / v)

    def resistance(self, v):
        """Newtons of running resistance: rolling plus aerodynamic."""
        rolling = 0.0015 * self.mass_t * 1000.0 * G      # ~1.5 N per kN of weight
        aero = 0.5 * 1.2 * self.cd_a * v * v
        return rolling + aero

    def accel(self, v, grade_permille):
        m = self.mass_t * 1000.0 * self.rot
        f = (self.tractive_effort(v) - self.resistance(v)
             - self.mass_t * 1000.0 * G * grade_permille / 1000.0)
        return f / m


KISS = Stock("MÁV 815 Stadler KISS", 314, 4000, 400, 160, 155.88, load_t=30)
FLIRT = Stock("MÁV 415 Stadler FLIRT", 130, 2000, 200, 160, 74.7, load_t=15)
# V63 + 10 Bhv coaches, a stand-in for the push-pull sets still on the line
PUSHPULL = Stock("V43 push-pull, 6 coaches", 340, 2200, 210, 130, 165.0, load_t=25)
# a heavy transit freight to Štúrovo
FREIGHT = Stock("V63 + 1600 t freight", 1720, 3680, 400, 100, 500.0,
                brake_service=0.45, brake_emerg=0.70, cd_a=14.0)
RAILJET = Stock("EC, 7 coaches + 380", 520, 6400, 274, 160, 200.0, cd_a=11.0)


def simulate(stock, limits, grades, stops, ds=20.0, dwell_s=36.0,
             start_km=0.0, end_km=None):
    """Run a service and return (seconds, samples).

    limits  : list of speed limits in km/h, one per ds step from km 0
    grades  : list of gradients in per mille, one per ds step
    stops   : chainages in metres where the train calls
    """
    n = len(limits)
    i0 = int(start_km * 1000 / ds)
    i1 = n - 1 if end_km is None else min(n - 1, int(end_km * 1000 / ds))

    v_lim = [min(l / 3.6, stock.v_max) for l in limits]
    for s in stops:
        j = int(round(s / ds))
        if i0 <= j <= i1:
            v_lim[j] = 0.0
    v_lim[i0] = 0.0
    v_lim[i1] = 0.0

    # backward pass: never faster than we can brake from
    allow = list(v_lim)
    for i in range(i1 - 1, i0 - 1, -1):
        cap = math.sqrt(allow[i + 1] ** 2 + 2 * stock.b_serv * ds)
        allow[i] = min(allow[i], cap)

    t, v, samples = 0.0, 0.0, []
    for i in range(i0, i1):
        a = stock.accel(v, grades[i])
        v_next = math.sqrt(max(0.0, v * v + 2 * a * ds)) if a > 0 else v
        v_next = min(v_next, allow[i + 1])
        v_mid = max((v + v_next) / 2.0, 0.35)
        t += ds / v_mid
        samples.append((i * ds, v_next * 3.6, t))
        v = v_next
        if abs(v) < 0.4 and i * ds in ():
            pass
    stop_count = sum(1 for s in stops if i0 * ds < s < i1 * ds)
    t += stop_count * dwell_s
    return t, samples
