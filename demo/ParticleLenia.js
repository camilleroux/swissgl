// Copyright 2023 Google LLC.
// SPDX-License-Identifier: Apache-2.0

class ParticleLenia {
    constructor(glsl, gui) {
        this.glsl = glsl;
        glsl.include = `
        vec2 peak_f(float x, float mu, float sigma) {
          float t = (x-mu)/sigma;
          float y = exp(-t*t);
          return vec2(y, -2.0*t*y/sigma);
        }`;
        this.step_n = 5;
        this.viewR = 15.0;
        const params = this.params = {dt: 0.1,
            mu_k: 4.0, sigma_k: 1.0, w_k: 0.022,
            mu_g: 0.6, sigma_g: 0.15, c_rep: 1.0};
        gui.add(params, 'mu_k',    0.0, 5.0).onChange(()=>this.updateNormCoef());
        gui.add(params, 'sigma_k', 0.1, 2.0).onChange(()=>this.updateNormCoef());
        gui.add(params, 'mu_g',    0.0, 1.5);
        gui.add(params, 'sigma_g', 0.1, 1.0);
        gui.add(params, 'c_rep',   0.0, 2.0);
        gui.add(this, 'step_n',  0, 50, 1);
        gui.add(this, 'reset');

        this.reset();
    }

    updateNormCoef() {
        const {mu_k, sigma_k} = this.params;
        const mu = mu_k*sigma_k;
        const dr = 0.1*sigma_k, R=sigma_k*3.0;
        let acc = 0.0, prev=null;
        for (let r = Math.max(mu_k-R, 0.0); r<mu_k+R; r+=dr) {
            let y = (r-mu)/sigma_k;
            let v = r*Math.exp(-y*y);
            if (prev!=null) acc += (prev+v)*0.5;
            prev = v;
        }
        this.params.w_k = 1.0 / (acc*dr*2.0*Math.PI);
    }
    
    reset() {
        this.state = this.glsl({seed:Math.random()*1234567},
            `(hash(ivec3(I, int(seed))).xy-0.5)*12.0,0,0`,
            {size:[20, 10], story:2, format:'rgba32f'});
    }

    step() {
        this.glsl(this.params,`
        vec3 pos = Src(I).xyz;
        float mu = mu_k*sigma_k;
        vec3 R_grad=vec3(0), U_grad=vec3(0);
        float U = peak_f(0.0, mu, sigma_k).x*w_k;
        for (int y=0; y<ViewSize.y; ++y)
        for (int x=0; x<ViewSize.x; ++x) {
          if (x==I.x && y==I.y) continue;
          vec3 pos1 = Src(ivec2(x, y)).xyz;
          vec3 dp = pos-pos1;
          float r = length(dp);
          dp /= max(r, 1e-4);
          if (r<1.0) {
            R_grad -= dp*(1.0-r);
          }
          vec2 K = peak_f(r, mu, sigma_k)*w_k;
          U_grad += K.g*dp;
          U += K.x;
        } 
        vec2 G = peak_f(U, mu_g, sigma_g);
        pos -= dt*(R_grad*c_rep - G.g*U_grad);
        out0 = vec4(pos,0.0);
        `,  this.state); 
    }

    render(target=null, pointR=0.4) {
        const {state, viewR} = this;
        this.glsl({state:state[0], Grid: state[0].size, viewR, pointR,
              Blend:'d*(1-sa)+s',Aspect:'mean'},`
        varying vec2 p;
        //VERT
        vec4 vertex(vec2 uv) {
            p = vec2(uv)*2.0-1.0;
            vec2 pos = state(ID).xy + p*pointR;
            return vec4(pos/viewR, 0, 1);
        }
        //FRAG
        void fragment() {
            out0 = vec4(exp(-dot(p,p)*4.));
        }`, target);        
    }

    frame() {
        const {state} = this;
        for (let i=0; i<this.step_n; ++i) {
            this.step();
        }
        this.render();
    }
}