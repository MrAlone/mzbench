[ % "power function" worker start -- something that couldn't be done with loop
    {pool, [{size, 60},
            % Syntax: {pow, <N>, <W>, <time>}
            %  in this case <W> workers are expected to start in a given period of time via x^n function
            {worker_start, {pow, 0.5, 20, {1, sec}}},
            {worker_type, dummy_worker}],
        [{print, {sprintf, "My number is: ~p", [{round_robin, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}]}}]}].
