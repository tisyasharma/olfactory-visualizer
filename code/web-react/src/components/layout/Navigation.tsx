import { NavLink } from 'react-router-dom';

export function Navigation() {
  return (
    <nav className="nav">
      <div className="nav__inner">
        <NavLink to="/" className="brand">
          Olfactory DV
        </NavLink>
        <div className="nav__links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Home
          </NavLink>
          <NavLink to="/dual-injection" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Dual Injection
          </NavLink>
          <NavLink to="/rabies" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Rabies Tracing
          </NavLink>
          <NavLink to="/scrna" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            scRNA-seq
          </NavLink>
          <NavLink to="/upload" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Upload
          </NavLink>
          <NavLink to="/napari" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Napari Viewer
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
